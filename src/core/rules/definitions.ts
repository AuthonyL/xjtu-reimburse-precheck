import type { AttachmentType } from '../types.js';
import type { RuleConfig, RuleId } from './config.js';
import type { Effect, Rule, RuleBase, Scope, Stage, ThresholdRule } from './model.js';
import { highValue } from './engine/kinds/coded/high-value.js';
import { delegatedMaterials } from './engine/kinds/coded/delegated.js';
import { aiPayment, exchangeRate } from './engine/kinds/coded/currency.js';
import { travel } from './engine/kinds/coded/travel.js';

export function buildRules(config: RuleConfig): Rule[] {
  const base = (
    id: RuleId,
    scope: Scope = 'invoice',
    stage: Stage = 'invoice',
  ): Omit<RuleBase, 'kind'> => ({
    id,
    scope,
    stage,
    ...config.ruleOptions[id],
    restrictive: config.ruleOptions[id].severity === 'error',
  });
  const require = (
    attachment: AttachmentType,
    reason: string,
    daily = false,
    coversSubsets = false,
  ): Effect => ({
    kind: 'require',
    attachment,
    reason,
    ...(daily ? { aggregation: 'sellerDay' as const } : {}),
    ...(coversSubsets ? { coversSubsets: true } : {}),
  });
  const physicalCategories = {
    exempt: config.exemptTaxCategories,
    service: config.serviceTaxCategories,
  };
  const delegated = { groupFlags: { outsourced: true }, excludeNamedAiGroup: true };
  const threshold = (
    id: RuleId,
    key: keyof RuleConfig['thresholds'],
    scope: Scope,
    measure: ThresholdRule['measure'],
    period: ThresholdRule['period'],
    effect: Effect | Effect[],
    extra: Partial<
      Omit<ThresholdRule, keyof RuleBase | 'kind' | 'threshold' | 'measure' | 'period' | 'effect'>
    > &
      Pick<RuleBase, 'appliesTo'> = {},
  ): ThresholdRule => ({
    ...base(id, scope, scope === 'group' ? 'group' : 'invoice'),
    kind: 'threshold',
    threshold: config.thresholds[key],
    measure,
    period,
    effect,
    ...extra,
  });
  // 顺序即旧引擎票内级联顺序；不同 stage 分开执行。
  return [
    { ...base('T1'), kind: 'coded', executor: 'batch', run: travel },
    {
      ...base('T2'),
      kind: 'keyword',
      keywords: config.deliveryKeywords,
      field: 'ruleText',
      sameDirectoryOnly: true,
      appliesTo: { kinds: ['domestic'] },
      effect: require('waybill', '邮寄需附运单明细或订单详情（仅同文件夹）'),
    },
    {
      ...base('expense'),
      kind: 'keyword',
      keywords: config.expense.mappings.flatMap((m) => m.keywords),
      field: 'ruleText',
      match: 'unmappedExpense',
      unknownExpense: config.expense.unknown,
      effect: { kind: 'finding', message: '无法判断支出内容，建议待定，请人工确认' },
    },
    { ...base('parse'), kind: 'passthrough' },
    {
      ...base('buyer'),
      kind: 'party',
      party: 'buyer',
      expected: config.buyer,
      appliesTo: { kinds: ['domestic'] },
    },
    threshold(
      'R1',
      'inventory',
      'invoice',
      'total',
      'invoice',
      require('inventory', '单张实物发票价税合计达到入库阈值', true),
      { appliesTo: { physicalOnly: true, currency: ['CNY'] }, physicalCategories },
    ),
    threshold(
      'R11',
      'inventory',
      'sellerDay',
      'total',
      'day',
      require('inventory', '整个批次同销方同日合计{dayTotal}元，达到入库阈值', true),
      {
        appliesTo: { physicalOnly: true, currency: ['CNY'] },
        physicalCategories,
        missingAggregation: {
          message: '销售方身份或开票日期不完整，无法可靠检查同销方同日拆票，请人工核对',
        },
      },
    ),
    {
      ...base('R9'),
      kind: 'taxCategory',
      match: 'physical',
      categories: config.exemptTaxCategories,
      serviceCategories: config.serviceTaxCategories,
      groupKeywords: config.groupKeywords.bankTransfer,
      appliesTo: {
        physicalOnly: true,
        groupFlags: { bankTransfer: true },
        excludeNamedOutsourcedGroup: config.groupKeywords.outsourced,
      },
      effect: require('inventory', '公转组中的器件需要入库', true),
    },
    threshold(
      'R2',
      'payment',
      'sellerDay',
      'total',
      'day',
      require('payment', '同销方同日合计{dayTotal}元，达到支付记录阈值', true, true),
      { appliesTo: { kinds: ['domestic'], currency: ['CNY'] } },
    ),
    threshold(
      'R7',
      'verification',
      'invoice',
      'total',
      'invoice',
      require('verification', '票面金额达到验真阈值，请验真并附验真结果'),
      { appliesTo: { kinds: ['domestic'] } },
    ),
    { ...base('R13', 'line'), kind: 'coded', executor: 'batch', run: highValue },
    {
      ...base('R4'),
      kind: 'keyword',
      keywords: config.storeKeywords,
      field: 'ruleText',
      effect: require('store', '品名含店铺证明关键字'),
    },
    {
      ...base('R5'),
      kind: 'taxCategory',
      categories: config.designKeywords,
      match: 'delegated',
      target: 'delegated',
      expenseContent: config.expense.outsourced,
      appliesTo: delegated,
      effect: require('designList', `支出内容建议为${config.expense.outsourced}，需要对方盖章的明细清单`),
    },
    {
      ...base('R6'),
      kind: 'keyword',
      keywords: config.groupKeywords.outsourced,
      field: 'groupName',
      target: 'delegated',
      appliesTo: delegated,
      effect: require('designList', '委托业务组需要对方盖章的明细清单'),
    },
    { ...base('F5'), kind: 'coded', executor: 'batch', run: delegatedMaterials },
    {
      ...base('F2'),
      kind: 'keyword',
      keywords: config.horizontalOnlyKeywords,
      field: 'ruleText',
      effect: { kind: 'finding', message: '此类费用只能走横向经费，纵向项目请拆出单独报销' },
    },
    {
      ...base('F6'),
      kind: 'keyword',
      keywords: config.purposeKeywords,
      field: 'ruleText',
      effect: require('purposeNote', '办公或日用清洁类支出需要说明实际科研用途'),
    },
    {
      ...base('F1'),
      kind: 'keyword',
      keywords: config.legacyInvoiceKeywords,
      field: 'invoiceText',
      match: 'legacy',
      effect: { kind: 'finding', message: '旧版电子发票，请确认有发票专用章' },
    },
    { ...base('R3'), kind: 'coded', executor: 'batch', run: aiPayment },
    { ...base('R10'), kind: 'coded', executor: 'batch', run: exchangeRate },
    threshold(
      'F5-documents',
      'outsourcedContract',
      'group',
      'delegatedTotal',
      'group',
      [
        require('contract', '委托组合计{delegatedTotal}元达到阈值，需要合同原件'),
        require('acceptanceNote', '大额委托业务需要验收合格说明'),
      ],
      { appliesTo: delegated, target: 'delegated' },
    ),
    threshold(
      'R12',
      'highGroup',
      'group',
      'groupTotal',
      'group',
      require('systemApproval', '该组合计{groupTotal}元达到阈值，还需附系统里下载的审批表'),
      {
        appliesTo: { requireHighValue: true },
        target: 'highValue',
        highUnit: config.thresholds.highUnit,
        physicalCategories,
      },
    ),
    {
      ...base('dup', 'workspace', 'workspace'),
      kind: 'duplicate',
      scopes: ['batch', 'workspace', 'history'],
    },
    { ...base('rejected', 'workspace', 'workspace'), kind: 'lookup', set: 'rejected' },
    ...(['manual', 'ofd', 'unrecognized-pdf'] as const).map((id): Rule => ({
      ...base(id, 'batch', 'diagnostics'),
      kind: 'passthrough',
    })),
    ...(['L1', 'L2', 'L4', 'L5', 'L6'] as const).map((id): Rule => ({
      ...base(id, 'workspace', 'labor'),
      kind: 'coded',
      executor: 'labor',
    })),
    {
      ...base('L3', 'workspace', 'labor'),
      kind: 'laborStandard',
      consultation: config.laborStandards.consultation,
      other: config.laborStandards.other,
    },
  ];
}
