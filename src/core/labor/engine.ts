import { withFindingId } from '../domain/finding-id.js';
import type { Finding, Severity } from '../types.js';
import type { RuleConfig } from '../rules/config.js';
import { buildRules } from '../rules/definitions.js';
import { ruleOption } from '../rules/model.js';
import { ruleDefinition } from '../rules/catalog.js';
import { applyLaborManual } from './parse.js';
import { applicableStandards } from './standards.js';
import { groupLaborVersions } from './versions.js';
import {
  LABOR_TYPES,
  type LaborEntry,
  type LaborFields,
  type LaborReport,
  type LaborScan,
} from './types.js';

export function checkLabor(scan: LaborScan, config: RuleConfig): LaborReport {
  const rules = new Map(buildRules(config).map((rule) => [rule.id, rule]));
  const standardRule = ruleOption(rules, 'L3');
  if (standardRule.kind !== 'laborStandard') throw new Error('L3 必须登记为劳务标准规则');
  const entries: LaborEntry[] = scan.statements.map((statement) => {
    const body = statement.text.normalize('NFKC').replace(/\s/g, '');
    const manual = scan.manual.labor?.[statement.relativePath] ?? {};
    const fields = applyLaborManual(statement.parsed, manual, config);
    const findings: Finding[] = [];
    const add = (
      id: 'L1' | 'L2' | 'L3' | 'L4' | 'L5',
      severity: Severity,
      message: string,
      action?: string,
    ) => {
      const option = ruleOption(rules, id);
      if (!option.enabled) return;
      const definition = ruleDefinition(id)!;
      findings.push(
        withFindingId(
          {
            code: message,
            ruleId: id,
            severity: option.severity === definition.defaultSeverity ? severity : option.severity,
            message,
            action: action ?? definition.action.replaceAll('{file}', statement.relativePath),
            files: [statement.path],
            invoiceNumbers: [],
          },
          scan.dir,
        ),
      );
    };
    for (const [key, label] of Object.entries({
      name: '姓名',
      organization: '单位',
      title: '职称',
      quantity: '数量',
      unitPrice: '单价',
      total: '合计',
    }) as [keyof LaborFields, string][])
      if (fields[key] === null || fields[key] === '')
        add('L1', 'error', `缺少${label}`, `在情况说明中补写${label}，或修正对应字段后重新检查。`);
    if (!fields.dates.length) add('L1', 'error', '缺少具体日期', '补写每次服务的具体年月日。');
    else if (fields.dates.some((d) => d.precision !== 'day'))
      add('L1', 'error', '日期没写到具体哪一天', '把月份补全为每次服务的具体年月日。');
    if (!fields.mode) add('L1', 'error', '没写线上还是线下', '在情况说明中写清线上或线下服务。');
    const days = new Set(fields.dates.filter((d) => d.precision === 'day').map((d) => d.date)).size;
    if (
      fields.quantity !== null &&
      fields.dates.length &&
      fields.dates.every((d) => d.precision === 'day')
    ) {
      if (fields.mode === 'online' && fields.unit === '次' && fields.quantity !== days)
        add(
          'L1',
          'warning',
          '线上要写清是哪几次：次数与日期个数不一致',
          '列出每次线上服务日期；同日多次请补充各次具体时间，并人工核对。',
        );
      if (fields.mode === 'offline' && fields.unit === '天' && fields.quantity !== days)
        add(
          'L1',
          'warning',
          '线下要写清是哪几天：天数与日期个数不一致',
          '逐日列出线下服务日期，核对服务天数。',
        );
    }
    const mismatchedUnits =
      fields.unit !== null && fields.priceUnit !== null && fields.unit !== fields.priceUnit;
    if (mismatchedUnits)
      add(
        'L2',
        'error',
        `数量与单价的单位不一致（${fields.unit} / ${fields.priceUnit}），不能直接核对合计`,
        '核对每次、每天或每半天的计费口径，把数量和单价转换为同一单位后重新填写。',
      );
    for (const key of ['quantity', 'unitPrice', 'total'] as const)
      if (
        fields[key] !== null &&
        (!Number.isFinite(fields[key]) ||
          fields[key]! < 0 ||
          (key === 'quantity' && fields[key] === 0))
      )
        add(
          'L2',
          'error',
          `${{ quantity: '数量', unitPrice: '单价', total: '合计' }[key]}不合法`,
          '核对原文的正负号和金额；数量应大于零，单价和合计不能为负。',
        );
    if (
      !mismatchedUnits &&
      fields.unitPrice !== null &&
      fields.quantity !== null &&
      fields.total !== null &&
      Math.abs(fields.unitPrice * fields.quantity - fields.total) > 0.010000001
    )
      add(
        'L2',
        'error',
        '单价 × 数量与合计不一致',
        '核对单价、数量和合计，修正情况说明或手填字段。',
      );
    if (
      manual.tableAmount !== undefined &&
      fields.total !== null &&
      Math.abs(manual.tableAmount - fields.total) > 0.010000001
    )
      add(
        'L2',
        'error',
        '发放表金额与情况说明合计不一致',
        '核对学校发放表与情况说明，确保实际发放金额一致。',
      );
    const result = applicableStandards(fields, manual, config, standardRule);
    const standards = standardRule.enabled ? result.rows : [];
    if (result.missing) add('L3', 'warning', result.missing);
    if (fields.type === 'consultation' && standards.some((s) => s.taxBasis === 'after'))
      add('L3', 'info', '其他经费校内人员标准为税后金额，请核对税后发放额');
    if (fields.unitPrice !== null && standards.length) {
      if (fields.type === 'consultation') {
        const [other, horizontal] = standards;
        if (other!.position === 'above' && horizontal!.position === 'above')
          add('L3', 'error', '咨询费单价超过其他经费与横向两套标准上限');
        else if (other!.position === 'above') add('L3', 'warning', '此金额仅横向经费可发');
        else if (horizontal!.position === 'above')
          add('L3', 'warning', '单价超过横向标准上限，请确认适用经费');
        if (standards.some((s) => s.position === 'below'))
          add('L3', 'info', '单价低于适用标准下限，请确认发放口径');
      } else {
        if (standards[0]!.position === 'above')
          add('L3', 'error', '其他劳务费单价超过适用标准上限');
        if (
          fields.type === 'invigilation' ||
          fields.type === 'examGrading' ||
          fields.type === 'editing'
        )
          add('L3', 'info', `适用条件：${standards[0]!.label.split('；')[1]}`);
      }
    }
    if (
      fields.type &&
      config.labor.reclassificationKeywords.some((k) => LABOR_TYPES[fields.type!].includes(k)) &&
      config.labor.consultationFeeKeywords.some((k) => body.includes(k))
    )
      add(
        'L4',
        'warning',
        '应归为其他劳务费发放',
        '按实际讲座、评审、答辩或监考类型填写其他劳务费，修改正文中的咨询费。',
      );
    const requirements: LaborEntry['requirements'] = [];
    if (
      ruleOption(rules, 'L5').enabled &&
      fields.mode === 'offline' &&
      config.labor.meetingKeywords.some((k) => body.includes(k))
    ) {
      const labels = { settlement: '会议决算表', notice: '会议通知', attendance: '参会人员签到表' };
      for (const type of Object.keys(labels) as (keyof typeof labels)[]) {
        const folder = statement.relativePath.split('/').slice(0, -1).join('/');
        const files = scan.attachments.filter(
          (a) =>
            a.relativePath.split('/').slice(0, -1).join('/') === folder &&
            (scan.manual.laborAttachments?.[a.relativePath]
              ? scan.manual.laborAttachments[a.relativePath] === type
              : config.labor.attachmentKeywords[type].some((k) =>
                  a.relativePath.split('/').at(-1)!.includes(k),
                )),
        );
        requirements.push({
          type,
          label: labels[type],
          files,
          status: files.length ? 'found' : 'missing',
        });
        if (!files.length)
          add(
            'L5',
            'warning',
            `会议咨询缺少${labels[type]}`,
            `把${labels[type]}复印件放入本情况说明所在文件夹；会议咨询应在会议决算中列示。`,
          );
      }
    }
    findings.sort(
      (a, b) =>
        ['error', 'warning', 'info'].indexOf(a.severity) -
        ['error', 'warning', 'info'].indexOf(b.severity),
    );
    return { ...statement, fields, manual, findings, standards, requirements };
  });
  const versionGroups = groupLaborVersions(entries, config, scan.dir, rules);
  const counted = entries.filter((e) => e.counted);
  return {
    payoutCount: counted.length,
    versionGroups,
    dir: scan.dir,
    name: scan.dir.split(/[\\/]/).at(-1) ?? '劳务费',
    entries,
    attachments: scan.attachments,
    diagnostics: scan.diagnostics,
    total: counted.reduce((sum, e) => sum + (e.fields.total ?? 0), 0),
    passed: counted.filter(
      (e) => !e.findings.some((f) => f.severity !== 'info' && f.ruleId !== 'L6'),
    ).length,
    issueCount:
      scan.diagnostics.length +
      entries.reduce(
        (sum, e) =>
          sum + e.findings.filter((f) => f.severity !== 'info' && f.ruleId !== 'L6').length,
        0,
      ) +
      versionGroups.length,
  };
}
