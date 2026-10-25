import { relativeProblemFile, requirementId, withFindingId } from '../domain/finding-id.js';
import { findManualEntry } from '../manual.js';
import { pathKey, relativePath, samePath } from '../fs-path.js';
import { basename, dirname } from 'node:path';
import type {
  Attachment,
  AttachmentType,
  Batch,
  CheckContext,
  CheckResult,
  CheckedGroup,
  Finding,
  Group,
  Invoice,
  InvoiceLine,
  Requirement,
} from '../types.js';
import { attachmentLabels, requirementStatusLabels } from '../attachments.js';
import { groupName } from '../group.js';
import { hasValidTaxIdLength, parseWarningCode, roundMoney } from '../parse/common.js';
import {
  containsAny,
  isAiInvoice,
  isDelegatedInvoice,
  isDelegatedGroup,
  invoiceRuleText,
  matchesServiceCategory,
  loadConfig,
  meets,
  type RuleConfig,
} from './config.js';
import { ruleAction } from './catalog.js';
import { matchItineraries } from './travel.js';

const textOf = invoiceRuleText;
const namedAi = (group: Group, config: RuleConfig): boolean =>
  config.groupKeywords.ai.some((k) => group.name.toLowerCase() === k.toLowerCase());
export function isPhysicalLine(line: InvoiceLine, config: RuleConfig): boolean {
  return (
    !containsAny(line.taxCategory || line.name, config.exemptTaxCategories) &&
    !matchesServiceCategory(line.taxCategory, config.serviceTaxCategories)
  );
}
const design = isDelegatedInvoice;
function sellerDay(invoice: Invoice, idsByName: Map<string, Set<string>>): string | null {
  const name = invoice.seller.name.trim().replace(/\s/g, '');
  const ids = idsByName.get(name);
  const seller =
    invoice.seller.taxId || (ids?.size === 1 ? [...ids][0]! : ids && ids.size > 1 ? '' : name);
  return seller && invoice.date
    ? `${seller.trim().replace(/\s/g, '')}|${invoice.date}|${invoice.currency}`
    : null;
}
function expense(invoice: Invoice, group: Group, config: RuleConfig): string {
  if (
    namedAi(group, config) ||
    isAiInvoice(invoice, config) ||
    invoice.kind !== 'domestic' ||
    invoice.currency !== 'CNY'
  )
    return config.expense.ai;
  if (group.flags.outsourced || design(invoice, config)) return config.expense.outsourced;
  return (
    config.expense.mappings.find((m) => containsAny(textOf(invoice), m.keywords))?.content ??
    (invoice.lines.length ? config.expense.default : config.expense.unknown)
  );
}
function findMaterials(
  batch: Batch,
  type: AttachmentType,
  invoices: Invoice[],
  config: RuleConfig,
  group: Group,
): { files: Attachment[]; fallback: boolean; candidates: Attachment[] } {
  const candidates = batch.attachments.filter(
    (a) => a.type === type || (type === 'designList' && a.type === 'repairList'),
  );
  const directories = new Set(
    invoices.length
      ? invoices.flatMap((i) =>
          i.sources
            .filter((s) => groupName(batch.dir, s.path) === group.name)
            .map((s) => pathKey(dirname(s.path))),
        )
      : [pathKey(group.dir)],
  );
  const local = candidates.filter((a) => directories.has(pathKey(a.directory)));
  if (type === 'waybill') return { files: local, fallback: false, candidates: [] };
  if (local.length)
    return {
      files: local,
      fallback: local.some((a) => samePath(a.directory, batch.dir)),
      candidates: [],
    };
  const fallback = candidates.filter((a) => {
    if (samePath(a.directory, batch.dir)) return true;
    const parts = relativePath(batch.dir, a.path).split('/');
    return (
      parts.length > 1 &&
      containsAny(parts[0]!, config.attachmentKeywords[type]) &&
      containsAny(parts[0]!, config.materialDirectoryKeywords)
    );
  });
  const unnamed = config.unconfirmedAttachmentTypes.includes(type)
    ? batch.attachments.filter((a) => a.type === 'unnamed' && directories.has(pathKey(a.directory)))
    : [];
  return {
    files: fallback,
    fallback: fallback.length > 0,
    candidates: fallback.length ? [] : unnamed,
  };
}
export function checkBatch(
  batch: Batch,
  config: RuleConfig = loadConfig(),
  context: CheckContext = {},
): CheckResult {
  const findings: Finding[] = [];
  const addFinding = (
    severity: Finding['severity'],
    ruleId: string,
    message: string,
    invoices: Invoice[] = [],
    groupId?: string,
    files?: string[],
    confirmed = false,
    options: {
      code?: string;
      severity?: Finding['severity'];
      requirementType?: Finding['requirementType'];
    } = {},
  ): void => {
    const ids = ruleId
      .split('/')
      .filter((id) => config.ruleOptions[id as keyof RuleConfig['ruleOptions']]?.enabled);
    if (!ids.length) return;
    const rank = { error: 0, warning: 1, info: 2 };
    const configured = ids
      .map((id) => config.ruleOptions[id as keyof RuleConfig['ruleOptions']].severity)
      .sort((a, b) => rank[a] - rank[b])[0]!;
    const targetGroup =
      batch.groups.find((g) => g.id === groupId) ??
      batch.groups.find((g) => invoices.some((i) => g.invoiceNumbers.includes(i.number)));
    const targetFiles = files ?? invoices.flatMap((i) => i.sources.map((s) => s.path));
    let code = options.code;
    if (ids.includes('parse') && code === undefined) {
      code = parseWarningCode(message);
      // 解析异常可能包含绝对路径；代码使用相对路径，原消息保持不变。
      for (const file of [...new Set(targetFiles)].sort((a, b) => b.length - a.length))
        for (const separator of ['/', '\\'])
          code = code.replaceAll(file.replace(/[\\/]/g, separator), () =>
            relativeProblemFile(batch.dir, file),
          );
    }
    findings.push(
      withFindingId(
        {
          severity: confirmed ? 'info' : (options.severity ?? configured),
          ...(options.code || ids.includes('parse') ? { code } : {}),
          ...(options.requirementType ? { requirementType: options.requirementType } : {}),
          ruleId: ids.join('/'),
          action: ruleAction(
            ids.join('/'),
            targetGroup?.name ?? '发票所在文件夹',
            targetFiles.map((f) => basename(f)).join('、') || '相关文件',
          ),
          message,
          invoiceNumbers: invoices.map((i) => i.number),
          files: files ?? invoices.flatMap((i) => i.sources.map((s) => s.path)),
          ...(targetGroup ? { groupId: targetGroup.id } : groupId ? { groupId } : {}),
        },
        batch.dir,
      ),
    );
  };
  for (const diagnostic of batch.diagnostics)
    addFinding(
      diagnostic.severity,
      diagnostic.ruleId,
      diagnostic.message,
      batch.invoices.filter((i) => diagnostic.invoiceNumbers.includes(i.number)),
      diagnostic.groupId,
      diagnostic.files,
    );
  const daily = new Map<string, number>();
  const idsByName = new Map<string, Set<string>>();
  for (const invoice of batch.invoices)
    if (invoice.seller.name && invoice.seller.taxId) {
      const name = invoice.seller.name.trim().replace(/\s/g, '');
      const ids = idsByName.get(name) ?? new Set<string>();
      ids.add(invoice.seller.taxId);
      idsByName.set(name, ids);
    }
  for (const invoice of batch.invoices) {
    const key = sellerDay(invoice, idsByName);
    if (key) daily.set(key, roundMoney((daily.get(key) ?? 0) + invoice.total));
  }
  const travelMatches = matchItineraries(
    batch,
    batch.invoices.filter(
      (i) => i.kind === 'domestic' && containsAny(textOf(i), config.transportKeywords),
    ),
  );
  const groups: CheckedGroup[] = batch.groups.map((originalGroup) => {
    const invoices = batch.invoices.filter((i) => originalGroup.invoiceNumbers.includes(i.number));
    const isAiGroup = namedAi(originalGroup, config);
    const delegatedInvoices = invoices.filter(
      (invoice) =>
        invoice.kind === 'domestic' && invoice.currency === 'CNY' && !isAiInvoice(invoice, config),
    );
    const group: Group = {
      ...originalGroup,
      flags: {
        ...originalGroup.flags,
        outsourced: isDelegatedGroup(originalGroup.name, invoices, config),
      },
    };
    const checked: CheckedGroup = {
      group,
      requirements: [],
      invoices: [],
      expenseContent: config.expense.unknown,
    };
    const require = (
      type: AttachmentType,
      ruleId: string,
      reason: string,
      target: Invoice[],
    ): void => {
      if (!config.ruleOptions[ruleId as keyof RuleConfig['ruleOptions']]?.enabled) return;
      const first = target[0];
      const combineDaily =
        (type === 'inventory' && ['R1', 'R11', 'R9'].includes(ruleId)) ||
        (type === 'payment' && ruleId === 'R2');
      const dayKey = first && combineDaily ? sellerDay(first, idsByName) : null;
      if (dayKey)
        target = invoices.filter(
          (i) => i.kind === 'domestic' && sellerDay(i, idsByName) === dayKey,
        );
      const numbers = target.map((i) => i.number);
      const existing = checked.requirements.find(
        (r) =>
          r.type === type &&
          (r.invoiceNumbers.join('|') === numbers.join('|') ||
            (ruleId === 'R3' &&
              type === 'payment' &&
              r.ruleIds.includes('R2') &&
              numbers.every((n) => r.invoiceNumbers.includes(n)))),
      );
      if (existing) {
        if (!existing.ruleIds.includes(ruleId)) existing.ruleIds.push(ruleId);
        if (!existing.reason.includes(reason)) existing.reason += `；${reason}`;
        return;
      }
      const match =
        type === 'itinerary' && first
          ? travelMatches.get(first.number)!
          : findMaterials(batch, type, target, config, group);
      const summary =
        first && dayKey
          ? `${first.seller.name || first.seller.taxId}，${first.date}，本组${target.length}张，价税合计${roundMoney(target.reduce((sum, i) => sum + i.total, 0)).toFixed(2)}元；`
          : '';
      const requirement: Requirement = {
        id: '',
        type,
        ruleIds: [ruleId],
        reason: summary + reason,
        invoiceNumbers: numbers,
        foundFiles: match.files,
        candidateFiles: match.candidates,
        status: match.files.length ? 'found' : match.candidates.length ? 'unconfirmed' : 'missing',
        ...(match.fallback
          ? { note: '在批次根目录找到，请确认对应（含批次材料目录）' }
          : match.candidates.length
            ? { note: '同一文件夹有未命名附件，可能已有，请确认；可在 manual.json 指定附件类型' }
            : {}),
      };
      checked.requirements.push(requirement);
    };
    for (const invoice of invoices) {
      const physical =
        invoice.kind === 'domestic' && invoice.lines.some((l) => isPhysicalLine(l, config));
      const highValueLines =
        invoice.kind === 'domestic'
          ? invoice.lines.flatMap((l, n) =>
              isPhysicalLine(l, config) &&
              l.grossUnitPrice !== null &&
              meets(l.grossUnitPrice, config.thresholds.highUnit)
                ? [n]
                : [],
            )
          : [];
      const content = expense(invoice, group, config);
      if (invoice.kind === 'domestic' && containsAny(textOf(invoice), config.transportKeywords))
        require('itinerary', 'T1', '市内交通需附对应行程单（仅同文件夹，前缀优先，其次金额，一一匹配）', [
          invoice,
        ]);
      if (invoice.kind === 'domestic' && containsAny(textOf(invoice), config.deliveryKeywords))
        require('waybill', 'T2', '邮寄需附运单明细或订单详情（仅同文件夹）', [invoice]);
      let cnyAmount: number | null = invoice.currency === 'CNY' ? invoice.total : null;
      if (content === config.expense.unknown)
        addFinding(
          'warning',
          'expense',
          '无法判断支出内容，建议待定，请人工确认',
          [invoice],
          group.id,
        );
      if (invoice.kind === 'domestic' && invoice.lines.some((l) => !l.taxCategory))
        addFinding(
          'warning',
          'parse',
          '明细缺少税目信息，已按品名及默认实物规则提示，请人工核对服务或委托业务分类',
          [invoice],
          group.id,
        );
      for (const warning of invoice.warnings)
        addFinding('warning', 'parse', warning, [invoice], group.id);
      if (
        invoice.kind === 'domestic' &&
        (invoice.buyer.name.replace(/\s/g, '') !== config.buyer.name.replace(/\s/g, '') ||
          (hasValidTaxIdLength(invoice.buyer.taxId) && invoice.buyer.taxId !== config.buyer.taxId))
      )
        addFinding(
          'error',
          'buyer',
          `购买方名称或税号不符，应为${config.buyer.name} / ${config.buyer.taxId}`,
          [invoice],
          group.id,
        );
      const key = sellerDay(invoice, idsByName);
      const dayTotal = key ? daily.get(key)! : invoice.total;
      if (!key && invoice.kind === 'domestic')
        addFinding(
          'warning',
          'R11',
          '销售方身份或开票日期不完整，无法可靠检查同销方同日拆票，请人工核对',
          [invoice],
          group.id,
        );
      if (
        physical &&
        invoice.currency === 'CNY' &&
        meets(invoice.total, config.thresholds.inventory)
      )
        require('inventory', 'R1', '单张实物发票价税合计达到入库阈值', [invoice]);
      if (physical && invoice.currency === 'CNY' && meets(dayTotal, config.thresholds.inventory))
        require('inventory', 'R11', `整个批次同销方同日合计${dayTotal.toFixed(2)}元，达到入库阈值`, [
          invoice,
        ]);
      if (
        physical &&
        group.flags.bankTransfer &&
        !containsAny(group.name, config.groupKeywords.outsourced)
      )
        require('inventory', 'R9', '公转组中的器件需要入库', [invoice]);
      if (
        invoice.kind === 'domestic' &&
        invoice.currency === 'CNY' &&
        meets(dayTotal, config.thresholds.payment)
      )
        require('payment', 'R2', `同销方同日合计${dayTotal.toFixed(2)}元，达到支付记录阈值`, [
          invoice,
        ]);
      if (invoice.kind === 'domestic' && meets(invoice.total, config.thresholds.verification))
        require('verification', 'R7', '票面金额达到验真阈值，请验真并附验真结果', [invoice]);
      if (highValueLines.length) {
        const instrument = highValueLines.filter((n) =>
          containsAny(
            `${invoice.lines[n]!.taxCategory} ${invoice.lines[n]!.name}`,
            config.instrumentKeywords,
          ),
        );
        if (instrument.length)
          require('assetRegistration', 'R13', '仪器类含税单价达到高值阈值，需要资产建账；请确认资产分类', [
            invoice,
          ]);
        if (instrument.length < highValueLines.length)
          require('highValueApproval', 'R13', '含税单价达到高值阈值，需要高值材料审批表；使用期须不超过1年，否则请按资产建账', [
            invoice,
          ]);
        require('explanation', 'R13', '需要附情况说明；理由库草稿须与实际使用期限及用途核对', [
          invoice,
        ]);
      }
      if (containsAny(textOf(invoice), config.storeKeywords))
        require('store', 'R4', '品名含店铺证明关键字', [invoice]);
      if (!isAiGroup && group.flags.outsourced) {
        if (design(invoice, config))
          require('designList', 'R5', `支出内容建议为${config.expense.outsourced}，需要对方盖章的明细清单`, delegatedInvoices);
        if (containsAny(group.name, config.groupKeywords.outsourced))
          require('designList', 'R6', `委托业务组需要对方盖章的明细清单`, delegatedInvoices);
        if (invoice.kind === 'domestic' && !isAiInvoice(invoice, config)) {
          const material = invoice.lines.filter(
            (line) =>
              line.taxCategory.trim() &&
              !matchesServiceCategory(line.taxCategory, config.serviceTaxCategories),
          );
          const service = invoice.lines.some((line) =>
            matchesServiceCategory(line.taxCategory, config.serviceTaxCategories),
          );
          if (material.length && service) {
            const details = material
              .map((line) => {
                const amount =
                  line.amount === null
                    ? '金额待读取'
                    : `${line.amount.toFixed(2)}元（含税${(line.amount + (line.tax ?? 0)).toFixed(2)}元）`;
                return `${line.name} ${amount}`;
              })
              .join('；');
            addFinding(
              'warning',
              'F5',
              `委托发票中混有材料明细：${details}；材料部分需入库，或请对方分开开票`,
              [invoice],
              group.id,
              undefined,
              false,
              { code: 'mixed-materials', severity: config.mixedDelegatedSeverity },
            );
          } else if (material.length === invoice.lines.length && material.length)
            addFinding(
              'error',
              'F5',
              '委托业务发票不要开成材料（应为生产生活服务 / 研发和技术服务 / 劳务等）',
              [invoice],
              group.id,
              undefined,
              false,
              { code: 'all-materials' },
            );
        }
      }
      if (containsAny(textOf(invoice), config.horizontalOnlyKeywords))
        addFinding(
          'warning',
          'F2',
          '此类费用只能走横向经费，纵向项目请拆出单独报销',
          [invoice],
          group.id,
        );
      if (containsAny(textOf(invoice), config.purposeKeywords))
        require('purposeNote', 'F6', '办公或日用清洁类支出需要说明实际科研用途', [invoice]);
      if (
        invoice.text
          ? containsAny(invoice.text, config.legacyInvoiceKeywords)
          : invoice.invoiceType === 'legacy'
      )
        addFinding('info', 'F1', '旧版电子发票，请确认有发票专用章', [invoice], group.id);
      if (
        namedAi(group, config) ||
        isAiInvoice(invoice, config) ||
        invoice.kind !== 'domestic' ||
        invoice.currency !== 'CNY'
      ) {
        require('payment', 'R3', 'AI订阅或外币收据需要付款凭证', [invoice]);
        require('subscription', 'R3', '需要订阅方案、介绍或定价截图', [invoice]);
        require('exchangeRate', 'R10', invoice.currency !== 'CNY'
          ? `请附支付日${invoice.date || '（待填）'}的中行${config.exchangeRateType}截图，并圈出所用汇率`
          : `请核对实际支付日并附中行${config.exchangeRateType}截图，圈出所用汇率；人民币发票请确认是否涉及外币支付`, [
          invoice,
        ]);
        if (invoice.currency !== 'CNY') {
          const manual = findManualEntry(batch, invoice);
          if (!invoice.date)
            addFinding(
              'warning',
              'R3',
              '请手填金额和支付日期',
              [invoice],
              group.id,
              undefined,
              false,
              { code: 'manual-amount' },
            );
          if (!manual?.exchangeRate)
            addFinding(
              'warning',
              'R10',
              '请手填汇率；截图不能自动读取牌价，折算金额留空',
              [invoice],
              group.id,
            );
          else if (
            manual.currency !== invoice.currency ||
            manual.paymentDate !== invoice.date ||
            (manual.exchangeRateType && manual.exchangeRateType !== config.exchangeRateType)
          )
            addFinding(
              'warning',
              'R10',
              '手填汇率的币种、支付日或汇率类型不匹配，折算金额留空',
              [invoice],
              group.id,
            );
          else
            cnyAmount = roundMoney((invoice.total * manual.exchangeRate) / (manual.rateBase ?? 1));
        }
      }
      checked.invoices.push({ invoice, expenseContent: content, cnyAmount, highValueLines });
    }
    const high = checked.invoices.filter((i) => i.highValueLines.length).map((i) => i.invoice);
    const groupTotal = invoices
      .filter((i) => i.currency === 'CNY')
      .reduce((s, i) => s + i.total, 0);
    const delegatedTotal = roundMoney(
      delegatedInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
    );
    if (
      group.flags.outsourced &&
      !isAiGroup &&
      meets(roundMoney(delegatedTotal), config.thresholds.outsourcedContract)
    ) {
      require('contract', 'F5-documents', `委托组合计${roundMoney(delegatedTotal).toFixed(2)}元达到阈值，需要合同原件`, delegatedInvoices);
      require('acceptanceNote', 'F5-documents', '大额委托业务需要验收合格说明', delegatedInvoices);
    }
    if (high.length && meets(roundMoney(groupTotal), config.thresholds.highGroup))
      require('systemApproval', 'R12', `该组合计${roundMoney(groupTotal).toFixed(2)}元达到阈值，还需附系统里下载的审批表`, high);
    if (group.flags.ai && !invoices.length) {
      require('payment', 'R3', 'AI订阅需要付款凭证', []);
      require('subscription', 'R3', 'AI订阅需要订阅说明截图', []);
      require('exchangeRate', 'R10', `按支付日提供中行${config.exchangeRateType}截图，并圈出所用汇率`, []);
      addFinding(
        'warning',
        'R3',
        '仅有截图或无法读取收据，请手填金额和支付日期',
        [],
        group.id,
        undefined,
        false,
        { code: 'manual-amount' },
      );
      addFinding('warning', 'R10', '请手填汇率；无手填汇率时折算金额留空', [], group.id);
    }
    const images = [
      ...batch.unidentified,
      ...batch.attachments.filter((a) => a.type === 'unnamed'),
    ].filter(
      (f) =>
        groupName(batch.dir, f.path) === group.name &&
        /\.(png|jpe?g|webp|heic|tiff?|bmp)$/i.test(f.path),
    );
    if (group.flags.ai && invoices.length && images.length)
      addFinding(
        'warning',
        'R3',
        '本组仍有未识别截图，请确认是否为其他订阅收据；如是，请手填金额和支付日期',
        [],
        group.id,
        images.map((f) => f.path),
        false,
        { code: 'manual-amount' },
      );
    const contents = [...new Set(checked.invoices.map((i) => i.expenseContent))];
    checked.expenseContent =
      contents.length === 1
        ? contents[0]!
        : contents.length > 1
          ? '混合（按发票分类）'
          : group.flags.ai
            ? config.expense.ai
            : config.expense.unknown;
    for (const r of checked.requirements) {
      r.id = requirementId(r, group.id);
      addFinding(
        r.status === 'found' ? 'info' : 'warning',
        r.ruleIds.join('/'),
        `${requirementStatusLabels[r.status]}${attachmentLabels[r.type]}：${r.reason}${r.note ? `；${r.note}` : ''}`,
        invoices.filter((i) => r.invoiceNumbers.includes(i.number)),
        group.id,
        [...r.foundFiles, ...r.candidateFiles].map((a) => a.path),
        r.status === 'found',
        { code: 'attachment:' + r.type, requirementType: r.type },
      );
    }
    return checked;
  });
  for (const invoice of batch.invoices) {
    const dirs = new Set(invoice.sources.map((s) => pathKey(dirname(s.path))));
    const formats = invoice.sources.map((s) => s.format);
    if (dirs.size > 1 || new Set(formats).size < formats.length)
      addFinding('error', 'dup', '同一批次内同号发票在不同目录或同一格式中重复出现，合计仅计一张', [
        invoice,
      ]);
    for (const other of context.otherBatches ?? [])
      if (other.id !== batch.id && other.invoices.some((i) => i.number === invoice.number))
        addFinding(
          'error',
          'dup',
          other.submitted
            ? `与${other.id}重复：已在 ${other.id} 报销（该批次已有学校报销单）`
            : `与其他批次 ${other.id} 重复`,
          [invoice],
        );
    if (context.submittedHistory?.has(invoice.number))
      addFinding('error', 'dup', '发票号已存在于已提交历史，请勿重复报销', [invoice]);
    if (context.rejectedNumbers?.has(invoice.number) || context.rejectedInfo?.has(invoice.number)) {
      const info = context.rejectedInfo?.get(invoice.number);
      const detail = info?.recorded
        ? `原因：${info.recorded.reason}（记录于 ${info.recorded.recordedAt.slice(0, 10)}）`
        : info?.inferred.length
          ? '可能原因（按规则推断）：' +
            info.inferred.map((r) => `${r.ruleId} ${r.name}`).join('、')
          : '未记录原因，可在『无法报销费用』里补充';
      addFinding('warning', 'rejected', '曾判为无法报销 — ' + detail, [invoice]);
    }
  }
  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.ruleId.localeCompare(b.ruleId));
  return { batch, findings, groups };
}
