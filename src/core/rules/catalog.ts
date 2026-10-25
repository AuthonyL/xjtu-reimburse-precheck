import defaults from './defaults.json' with { type: 'json' };
import type { AttachmentType, Severity } from '../types.js';
import type { RuleConfig, RuleId } from './config.js';
import { buildRules } from './definitions.js';
import type { Rule, Scope } from './model.js';
import { declarativeCriteria } from './criteria.js';
import { LABOR_TYPES } from '../labor/types.js';

export interface ConfigField {
  path: string;
  label: string;
  type: 'keywords' | 'threshold' | 'boolean' | 'select' | 'table' | 'mapping';
  options?: { value: string; label: string }[];
  multiple?: boolean;
  columns?: {
    key: string;
    label: string;
    type: 'text' | 'keywords' | 'number' | 'select';
    options?: { value: string; label: string }[];
  }[];
  general?: boolean;
  labor?: boolean;
  multiline?: boolean;
}
export interface RuleDefinition {
  id: RuleId;
  kind: Rule['kind'];
  scope: Scope;
  name: string;
  source: { kind: 'readme' | 'finance' | 'practice' | 'system'; number?: number };
  description: string;
  sourceText: string;
  defaultSeverity: Severity;
  action: string;
  config: ConfigField[];
}
export const README_SOURCE_TEXTS: Readonly<Record<number, string>> = {
  1: '金额超过500要入库单',
  2: '单日单公司超过 1k 要补支付记录',
  3: 'AI 是资料费/需要提供付款凭证',
  4: '亚克力需要提供店铺',
  5: 'PCB 外包属于委托业务费不是其他',
  6: 'PCB 外包设计需要提供设计清单',
  7: '发票超5k要验真',
  9: '除外包外其他公转器件要增加入库单',
  10: '美元汇率圈出来选择哪个汇率/中国银行官网提取汇率信息',
  11: '同一家公司当天开票500以上需要入库单，无论是否区分发票，切换500为两张都需要开具入库单',
  12: '高值材料审批表在入库完成之后，如果金额超过 1w 附带可以下载',
  13: '材料单价超过 1k 需要填写高值材料审批或者资产建账，高值材料属于使用期限不超过1年，资产建帐为仪器等类',
  14: '不要写文具办公用品类的',
};
export const FINANCE_SOURCE_TEXTS: Readonly<Record<number, string>> = {
  1: '发票是否盖章、抬头是否为西安交通大学',
  2: '横向纵向分开，文具、教具、办公用品、打印费、邮寄费、市内交通等都走横向',
  5: '委托的加工、测试、软件等要有对方盖章的明细清单。5万以上需要合同原件和验收合格说明。发票大类一般是生产生活服务、研发和技术服务或者劳务，不要开成材料。',
  6: '办公用品、日常生活用品需要附用途说明',
  7: '劳务费、咨询费等发放写清职称、具体时间、线上（哪几次）或线下（哪几天），讲座、评审、答辩、监考归为其他劳务。检查是否超过发放标准。',
};
export const RULE_NUMBERING = [
  'R + 数字 =「发票/README.txt」第几条',
  'F + 数字 = 财务补充要求第几条',
  'L = 劳务费检查（财务补充第 7 条的细分）',
  'T = 课题组惯例',
  '英文词 = 系统检查',
] as const;
export const RETIRED_RULE_NOTES = [
  {
    id: 'R14',
    sourceText: README_SOURCE_TEXTS[14]!,
    note: '已由 F2 代替',
    source: { kind: 'readme', number: 14 },
    readOnly: true,
  },
] as const;
const SYSTEM_SOURCE_TEXTS: Partial<Record<RuleId, string>> = {
  buyer: '财务补充第 1 条：抬头是否为西安交通大学。',
  dup: '同一张票重复报销会被财务退回；APP 检查批次内、跨批次及已提交历史。',
  rejected: 'APP 比对曾被判为无法报销的票据，避免遗漏已有退回原因。',
  expense: 'APP 在无法确定支出内容时提醒人工确认，避免直接采用不可靠的分类。',
  parse: 'APP 检查解析字段与金额是否可靠，读取失败或不完整时提醒核对原件。',
  manual: 'APP 检查手填数据与来源文件是否有效，避免无效金额或附件覆盖影响结果。',
  ofd: 'APP 无法单独读取 OFD 时要求补充 PDF 或 XML，避免将未读取的票据当作已检查。',
  'unrecognized-pdf': 'APP 提醒确认未识别 PDF 的内容，避免遗漏发票或材料。',
};
function sourceTextFor(id: RuleId, source: RuleDefinition['source']): string {
  if (source.kind === 'readme') return README_SOURCE_TEXTS[source.number!]!;
  if (source.kind === 'finance')
    return (
      FINANCE_SOURCE_TEXTS[source.number!]! +
      (id === 'L3'
        ? '\n标准出处：《西安交通大学评审费等项目开支管理办法》，财务手册第 60–61 页。'
        : '')
    );
  if (source.kind === 'practice')
    return id === 'T1'
      ? '以往批次和拒票目录里，打车、地铁票都附了行程单'
      : '以往批次里，顺丰快递票都附了发票运单明细';
  return SYSTEM_SOURCE_TEXTS[id]!;
}

const keywords = (path: string, label: string): ConfigField => ({ path, label, type: 'keywords' });
const threshold = (path: string, label: string): ConfigField => ({
  path: 'thresholds.' + path,
  label,
  type: 'threshold',
});
export const severityOptions = [
  { value: 'error', label: '错误' },
  { value: 'warning', label: '警告' },
  { value: 'info', label: '提示' },
];
export const GENERAL_CATALOG: ConfigField[] = [
  { path: 'buyer.name', label: '购买方名称', type: 'select', general: true },
  { path: 'buyer.taxId', label: '购买方税号', type: 'select', general: true },
  {
    path: 'exchangeRateType',
    label: '汇率类型',
    type: 'select',
    general: true,
    options: ['现汇买入价', '现钞买入价', '现汇卖出价', '现钞卖出价', '中行折算价'].map(
      (value) => ({ value, label: value }),
    ),
  },
  { path: 'highValueReasons', label: '情况说明理由库', type: 'table', general: true },
];
const defaultRules = new Map(buildRules(defaults as RuleConfig).map((rule) => [rule.id, rule]));
const rule = (
  id: RuleId,
  name: string,
  source: RuleDefinition['source'],
  description: string,
  action: string,
  config: ConfigField[] = [],
): RuleDefinition => ({
  id,
  kind: defaultRules.get(id)!.kind,
  scope: defaultRules.get(id)!.scope,
  name,
  source,
  description,
  sourceText: sourceTextFor(id, source),
  action,
  defaultSeverity: defaults.ruleOptions[id].severity as Severity,
  config: [
    { path: `ruleOptions.${id}.enabled`, label: '启用规则', type: 'boolean' },
    {
      path: `ruleOptions.${id}.severity`,
      label: '问题级别',
      type: 'select',
      options: severityOptions,
    },
    ...config,
  ],
});
const readme = (number: number) => ({ kind: 'readme' as const, number });
const finance = (number: number) => ({ kind: 'finance' as const, number });
const system = { kind: 'system' as const };
const physical = keywords('exemptTaxCategories', '不按实物入库的豁免税目');
const services = keywords('serviceTaxCategories', '委托允许的服务类税目');
const delegated = keywords('designKeywords', '委托业务税目关键字');
const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
const column = (
  key: string,
  label: string,
  labels: Record<string, string>,
): NonNullable<ConfigField['columns']>[number] => ({
  key,
  label,
  type: 'select',
  options: options(labels),
});
export const LABOR_CATALOG: ConfigField[] = [
  {
    path: 'laborStandards.consultation',
    label: '咨询费标准（同时比较两套经费）',
    type: 'table',
    labor: true,
    columns: [
      column('fund', '经费', { horizontal: '横向', other: '其他经费' }),
      column('scope', '人员范围', { all: '所有人员', internal: '校内', external: '校外' }),
      column('rank', '等级', { academic: '院士/全国知名专家', senior: '高级职称', other: '其他' }),
      column('period', '时间', {
        halfDay: '半天',
        shortDay: '≤2天',
        longDay: '>2天',
        communication: '通讯',
      }),
      { key: 'min', label: '下限', type: 'number' },
      { key: 'max', label: '上限', type: 'number' },
      column('taxBasis', '税基', { before: '税前', after: '税后' }),
    ],
  },
  {
    path: 'laborStandards.other',
    label: '其他劳务费上限',
    type: 'table',
    labor: true,
    columns: [
      column('type', '劳务类型', LABOR_TYPES),
      column('role', '人员/学生层次', {
        academic: '院士/全国知名专家',
        senior: '高级职称/六级职员',
        other: '其他',
        bachelor: '本科生',
        master: '硕士生',
        doctor: '博士生',
        teacher: '教师',
        administrative: '行政管理人员',
        any: '所有人员',
      }),
      column(
        'unit',
        '计费单位',
        Object.fromEntries(
          ['次', '天', '半天', '小时', '篇', '人·生', '套', '份'].map((s) => [s, s]),
        ),
      ),
      { key: 'max', label: '上限', type: 'number' },
      column('workTime', '工作时间', { any: '不限', work: '工作时间', holiday: '双休日/节假日' }),
      { key: 'note', label: '适用说明', type: 'text' },
    ],
  },
  ...Object.entries(LABOR_TYPES).map(([key, label]): ConfigField => ({
    path: 'labor.templates.' + key,
    label: label + '情况说明模板',
    type: 'select',
    multiline: true,
    labor: true,
  })),
];
export const RULE_CATALOG: RuleDefinition[] = [
  rule(
    'T1',
    '市内交通附行程单',
    { kind: 'practice', number: 1 },
    '客运或打车票按同目录前缀、金额匹配行程单，一份只对应一张票。',
    '把 {file} 对应的行程单放在同一文件夹；核对前缀、金额和实际行程。',
    [keywords('transportKeywords', '市内交通发票关键字')],
  ),
  rule(
    'T2',
    '邮寄附运单明细',
    { kind: 'practice', number: 2 },
    '快递或同城急送发票需同目录运单明细或订单详情。',
    '把运单明细或订单详情放到 {group} 中发票所在的同一文件夹。',
    [keywords('deliveryKeywords', '邮寄发票关键字')],
  ),
  rule(
    'L6',
    '疑似同一笔的多个版本',
    finance(7),
    '同名且金额相同或日期重叠的说明按一个版本组计一次。',
    '核对另一版本，保留正确的一份；可用『放入改好的文件』替换。',
  ),
  rule(
    'L1',
    '劳务要素齐全',
    finance(7),
    '逐项检查姓名、单位、职称、具体日期、形式、数量和金额。',
    '补全 {file} 的缺失要素，写清每次服务的具体日期和形式。',
    [
      keywords('labor.statementKeywords', '劳务情况说明识别关键字'),
      keywords('labor.paymentTableKeywords', '劳务发放表关键字'),
      keywords('labor.organizationEndings', '单位名称结尾'),
      ...Object.entries(LABOR_TYPES).map(([key, label]) =>
        keywords('labor.typeKeywords.' + key, label + '识别关键字'),
      ),
      keywords('labor.modeKeywords.online', '线上关键字'),
      keywords('labor.modeKeywords.offline', '线下关键字'),
    ],
  ),
  rule(
    'L2',
    '劳务金额核对',
    finance(7),
    '核对单价乘数量、情况说明合计与发放表金额。',
    '核对单价、数量、合计和发放表，修正不一致的金额。',
  ),
  rule(
    'L3',
    '劳务发放标准',
    finance(7),
    '咨询同时比较横向及其他经费，其他劳务按类型和人员查上限。',
    '按适用标准调整单价或确认经费和人员条件，再修改发放表与情况说明。',
    [
      keywords('labor.internalOrganizationKeywords', '校内单位识别关键字'),
      keywords('labor.titles.academic', '院士级职称'),
      keywords('labor.titles.senior', '高级职称'),
      keywords('labor.titles.other', '其他职称'),
      keywords('labor.personnelKeywords.teacher', '监考教师职称关键字'),
      keywords('labor.personnelKeywords.administrative', '监考行政人员职称关键字'),
      ...LABOR_CATALOG,
    ],
  ),
  rule(
    'L4',
    '劳务类型归类',
    finance(7),
    '讲座、评审、答辩、监考按其他劳务费发放。',
    '按实际服务归为其他劳务费，修改正文中的咨询费。',
    [
      keywords('labor.reclassificationKeywords', '其他劳务归类关键字'),
      keywords('labor.consultationFeeKeywords', '正文咨询费关键字'),
    ],
  ),
  rule(
    'L5',
    '会议咨询附件',
    finance(7),
    '线下会议咨询应有决算、通知和签到表。',
    '补充会议决算表、会议通知、参会人员签到表复印件。',
    [
      keywords('labor.meetingKeywords', '会议咨询关键字'),
      keywords('labor.attachmentKeywords.settlement', '会议决算表关键字'),
      keywords('labor.attachmentKeywords.notice', '会议通知关键字'),
      keywords('labor.attachmentKeywords.attendance', '参会签到表关键字'),
    ],
  ),
  rule(
    'buyer',
    '购买方抬头',
    system,
    '核对购买方名称和完整税号；税号读取不全时只核对名称。',
    '核对原票；购买方不符时联系销售方重开。',
    GENERAL_CATALOG.filter((f) => f.path.startsWith('buyer.')),
  ),
  rule(
    'R1',
    '单张实物入库',
    readme(1),
    '单张实物发票达到阈值需要入库。',
    '在资产系统登记入库，把记账单放进 {group}。',
    [threshold('inventory', '入库金额'), physical, services],
  ),
  rule(
    'R11',
    '同销方同日入库',
    readme(11),
    '整个批次合并同销方同日金额，组内合并材料要求。',
    '在资产系统登记入库，把记账单放进 {group}。',
    [threshold('inventory', '入库金额'), physical, services],
  ),
  rule(
    'R9',
    '公转器件入库',
    readme(9),
    '公转组中委托业务以外的实物器件需要入库。',
    '在资产系统登记入库，把记账单放进 {group}。',
    [physical, services],
  ),
  rule(
    'R2',
    '支付记录',
    readme(2),
    '同销方同日金额达到阈值需要支付记录。',
    '核对同销方当天订单，把支付记录或付款凭证放进 {group}。',
    [threshold('payment', '支付记录金额')],
  ),
  rule(
    'R7',
    '发票验真',
    readme(7),
    '单张金额达到阈值需要验真结果。',
    '在官方发票查验渠道验真，把结果放进 {group}。',
    [threshold('verification', '发票验真金额')],
  ),
  rule(
    'R13',
    '高值材料或资产建账',
    readme(13),
    '按含税单价判断，仪器建账，短期耗用材料附审批和说明。',
    '核对实际使用期；在 {group} 补高值审批或资产建账及情况说明。',
    [
      threshold('highUnit', '高值材料含税单价'),
      physical,
      services,
      keywords('instrumentKeywords', '仪器关键字'),
      GENERAL_CATALOG[3]!,
    ],
  ),
  rule(
    'R12',
    '高值组合计审批',
    readme(12),
    '含高值材料的组达到金额阈值后需要系统下载的审批表。',
    '入库完成后下载系统审批表，放进 {group}。',
    [
      threshold('highGroup', '系统审批组合计'),
      threshold('highUnit', '高值材料含税单价'),
      physical,
      services,
    ],
  ),
  rule(
    'R4',
    '店铺证明',
    readme(4),
    '税目、品名或文件名命中关键字时需要店铺证明。',
    '保存对应店铺截图或证明，放进 {group}。',
    [keywords('storeKeywords', '店铺证明关键字')],
  ),
  rule(
    'R5',
    '委托服务明细清单',
    readme(5),
    '服务税目识别委托业务，建议委托业务费并附盖章清单。',
    '向对方索取盖章的明细清单，放进 {group}。',
    [delegated],
  ),
  rule(
    'R6',
    '委托分组明细清单',
    readme(6),
    '委托业务组需要对方盖章的明细清单。',
    '向对方索取盖章的明细清单，放进 {group}。',
  ),
  rule(
    'R3',
    'AI 订阅材料',
    readme(3),
    'AI 或外币收据需要付款凭证、订阅说明；截图金额需手填。',
    '在 {group} 补付款凭证和订阅说明，并在手填区核对金额及支付日。',
    [keywords('aiKeywords', 'AI 订阅关键字')],
  ),
  rule(
    'R10',
    '支付日汇率',
    readme(10),
    '外币按支付日中行所选汇率类型折算，缺数值留空。',
    '按支付日查询中行牌价，圈出所用价格并保存到 {group}；核对手填汇率。',
    [GENERAL_CATALOG[2]!],
  ),
  rule(
    'F1',
    '旧版电子发票盖章',
    finance(1),
    '票面出现旧版发票代码字段时提醒核对发票专用章。',
    '打开 {file}，确认有销售方发票专用章。',
    [keywords('legacyInvoiceKeywords', '旧版电子票识别文字')],
  ),
  rule(
    'F2',
    '只能走横向经费',
    finance(2),
    '文教办公、打印、邮寄与客运等只能走横向，不区分当前批次经费。',
    '从本批拿出，单独走横向经费报销。',
    [keywords('horizontalOnlyKeywords', '横向限制关键字')],
  ),
  rule(
    'F5',
    '委托业务发票税目',
    finance(5),
    '委托组中有明确材料税目的发票应重开为服务类，AI 除外。',
    '纯材料票联系对方重开，税目改为服务类；混合票请将材料部分入库或分开开票。',
    [
      delegated,
      services,
      {
        path: 'mixedDelegatedSeverity',
        label: '混合委托发票级别',
        type: 'select',
        options: severityOptions,
      },
    ],
  ),
  rule(
    'F5-documents',
    '大额委托合同与验收',
    finance(5),
    '委托组合计达到阈值需要合同原件和验收合格说明。',
    '在 {group} 补合同原件和验收合格说明。',
    [threshold('outsourcedContract', '委托合同与验收组合计')],
  ),
  rule(
    'F6',
    '用途说明',
    finance(6),
    '办公、文具、日用清洁类支出需用途说明。',
    '写明科研用途，把用途说明放进 {group}。',
    [keywords('purposeKeywords', '用途说明关键字')],
  ),
  rule(
    'dup',
    '重复发票',
    system,
    '检查批次内、跨批次和已提交历史的同号发票。',
    '核对提交历史和原件，移出重复票据，避免重复报销。',
    [{ path: 'dupChecksum', label: '按文件内容检查不同号码的重复票据', type: 'boolean' }],
  ),
  rule(
    'rejected',
    '曾判为无法报销',
    system,
    '匹配拒票集合，优先显示记录原因，否则只推断本票规则。',
    '确认这张票这次能否报销；不能就移出本批。',
  ),
  rule(
    'expense',
    '支出内容待确认',
    system,
    '无法分类时提示经办人确认支出内容。',
    '核对品名、税目和实际用途，在设置中调整支出内容映射。',
  ),
  rule(
    'parse',
    '解析告警',
    system,
    '关键字段缺失、格式损坏或金额不平需要人工核对。',
    '打开 {file} 核对原件，必要时补充文字版 PDF 或 XML。',
  ),
  rule(
    'manual',
    '手填数据检查',
    system,
    '检查金额、来源及附件覆盖记录是否合法。',
    '核对 {group} 的手填记录、来源文件和附件类型。',
  ),
  rule(
    'ofd',
    'OFD 解析',
    system,
    '单独 OFD 无法读取时需要补充可解析版本。',
    '为 {file} 提供同号 PDF 或 XML 版。',
  ),
  rule(
    'unrecognized-pdf',
    '未识别 PDF',
    system,
    '未识别成发票或命名附件的 PDF 需人工确认。',
    '打开 {file} 核对内容；若为材料，请命名或确认附件类型。',
  ),
];

export const ATTACHMENT_LABELS: Record<AttachmentType, string> = {
  payment: '支付记录 / 付款凭证',
  inventory: '入库单 / 记账单',
  store: '店铺截图或证明',
  designList: '对方盖章的明细清单',
  exchangeRate: '中行汇率截图',
  subscription: '订阅说明截图',
  highValueApproval: '高值材料审批表',
  systemApproval: '系统下载的审批表',
  explanation: '情况说明',
  assetRegistration: '资产建账',
  contract: '合同原件',
  waybill: '运单明细',
  itinerary: '行程单',
  repairList: '维修清单',
  verification: '发票验真结果',
  schoolForm: '学校报销单',
  purposeNote: '用途说明',
  acceptanceNote: '验收合格说明',
};
export const ATTACHMENT_CATALOG: ConfigField[] = [
  ...Object.entries(ATTACHMENT_LABELS).map(([type, label]) =>
    keywords('attachmentKeywords.' + type, label + '关键字'),
  ),
  keywords('materialDirectoryKeywords', '共用材料文件夹关键字'),
  {
    path: 'unconfirmedAttachmentTypes',
    label: '允许未命名候选的材料类型',
    type: 'select',
    multiple: true,
    options: Object.entries(ATTACHMENT_LABELS).map(([value, label]) => ({ value, label })),
  },
  keywords('ignoredExtensions', '忽略的文件扩展名'),
];
export const GROUP_CATALOG: ConfigField[] = [
  keywords('groupKeywords.deferred', '暂缓分组关键字'),
  keywords('groupKeywords.bankTransfer', '公转分组关键字'),
  keywords('groupKeywords.outsourced', '委托分组关键字'),
  keywords('groupKeywords.ai', 'AI 分组名称'),
  keywords('groupKeywords.labor', '劳务目录名称'),
];
export const EXPENSE_CATALOG: ConfigField[] = [
  ...Object.entries({
    default: '默认支出内容',
    ai: 'AI / 外币支出内容',
    outsourced: '委托支出内容',
    unknown: '无法分类时的支出内容',
  }).map(([key, label]) => ({ path: 'expense.' + key, label, type: 'select' as const })),
  {
    path: 'expense.mappings',
    label: '税目和品名映射',
    type: 'mapping',
    columns: [
      { key: 'keywords', label: '关键字', type: 'keywords' },
      { key: 'content', label: '支出内容', type: 'text' },
    ],
  },
];
export function ruleDefinition(id: string): RuleDefinition | undefined {
  return RULE_CATALOG.find((rule) => rule.id === id);
}
export function ruleAction(ids: string, group = '发票所在文件夹', file = '相关文件'): string {
  return [
    ...new Set(
      ids.split('/').map((id) => ruleDefinition(id)?.action ?? '打开相关文件，核对后处理。'),
    ),
  ]
    .map((template) => template.replaceAll('{group}', group).replaceAll('{file}', file))
    .join('；');
}
export const INVOICE_TYPE_LABELS = {
  digital: '数电票',
  legacy: '旧版电子票',
  foreign: '海外收据',
  manual: '手填',
} as const;

export function ruleMeaning(rule: RuleDefinition | string): string {
  const definition = typeof rule === 'string' ? ruleDefinition(rule) : rule;
  const id = typeof rule === 'string' ? rule : rule.id;
  if (id === 'R14') return 'R14 = README 第 14 条（已由 F2 代替）';
  if (!definition) return id + ' = 系统检查';
  if (id.startsWith('L')) return id + ' = 劳务费检查（财务补充第 7 条的细分）';
  const source = definition.source;
  const label =
    source.kind === 'readme'
      ? 'README'
      : source.kind === 'finance'
        ? '财务补充'
        : source.kind === 'practice'
          ? '课题组惯例'
          : '系统检查';
  return (
    id +
    ' = ' +
    label +
    (source.number ? ' 第 ' + source.number + ' 条' : '') +
    (id === 'buyer' ? '（参考财务补充第 1 条）' : '')
  );
}

export function criteria(
  rule: RuleDefinition | string,
  config: RuleConfig,
  options: { fullKeywords?: boolean } = {},
): string {
  const definition = typeof rule === 'string' ? ruleDefinition(rule) : rule;
  if (!definition) return '系统未提供此条目的判定说明，请核对相关文件。';
  const id = definition.id;
  const currentRule = buildRules(config).find((rule) => rule.id === id)!;
  const level = { error: '错误', warning: '警告', info: '提示' };
  const laborLevel = (normal: Severity) =>
    level[
      currentRule.severity === defaults.ruleOptions.L3.severity ? normal : currentRule.severity
    ];
  const threshold = (key: keyof RuleConfig['thresholds']) => {
    const value = config.thresholds[key];
    return `${value.operator === '>=' ? '≥' : '>'} ${value.value} 元`;
  };
  const list = (values: string[]) =>
    (options.fullKeywords ? values : values.slice(0, 8)).join('、') +
      (!options.fullKeywords && values.length > 8 ? `等 ${values.length} 个` : '') || '（无）';
  const range = '税目、品名或文件名';
  const physical = `豁免税目：${list(config.exemptTaxCategories)}；服务类税目：${list(config.serviceTaxCategories)}`;
  const delegated = `组名包含 ${list(config.groupKeywords.outsourced)}，或税目包含 ${list(config.designKeywords)}；AI 组和 AI 订阅除外`;
  const bodies: Partial<Record<RuleId, string>> = {
    R3: `AI 分组、AI 订阅或外币收据 → ${config.expense.ai}，需付款凭证和订阅说明；金额或支付日读不到时手填（AI 分组：${list(config.groupKeywords.ai)}；明细品名关键字：${list(config.aiKeywords)}）`,
    R10: `AI 或外币收据按支付日的中行「${config.exchangeRateType}」折算；截图圈出所用汇率，缺手填汇率时不折算`,
    R13: `非折扣实物明细含税单价 ${threshold('highUnit')} → 使用期不超过 1 年的材料附高值审批，仪器附资产建账，并附情况说明；仪器关键字：${list(config.instrumentKeywords)}（${physical}）`,
    F5: `${delegated}。有明细且全部为非服务类 → ${level[config.ruleOptions.F5.severity]}；服务与材料混合 → ${level[config.mixedDelegatedSeverity]}，材料部分入库或分开开票；服务类税目：${list(config.serviceTaxCategories)}`,
    T1: `${range}包含：${list(config.transportKeywords)} → 需同目录行程单；先按去后缀前缀、再按金额一对一匹配，剩余行程单仅待确认`,
    L1: '每份情况说明检查姓名、单位、职称、具体到日的每次日期、线上/线下、数量、单价和合计；次数或天数与具体日期数量不符另行提示',
    L2: '单价 × 数量与合计差额超过 0.01 元 → 金额不符；已手填发放表金额时还需与合计一致',
    L3: `咨询线上按通讯、线下按半天/≤2天/>2天查两套标准；仅超其他经费上限为${laborLevel('warning')}、两套都超为${laborLevel('error')}，低于适用下限为${laborLevel('info')}；税基按当前标准行采用。其他劳务按类型、人员、单位查上限；当前咨询标准 ${currentRule.kind === 'laborStandard' ? currentRule.consultation.length : 0} 行、其他劳务标准 ${currentRule.kind === 'laborStandard' ? currentRule.other.length : 0} 行`,
    L4: `类型属于 ${list(config.labor.reclassificationKeywords)}，正文又含 ${list(config.labor.consultationFeeKeywords)} → 应归其他劳务费`,
    L5: `线下且正文含 ${list(config.labor.meetingKeywords)} → 需要会议决算表、会议通知、参会人员签到表`,
    L6: '同一劳务目录中，同姓名且合计相同或日期重叠 → 疑似版本组，只计一笔，优先无错误警告的版本，其次修改时间最新的版本',
    parse:
      '解析字段缺失、税号不完整、金额/税额校验不平或文件损坏 → 人工核对原件；明细合计容差为每行 0.01 元',
    manual: '校验手填金额、币种、日期、汇率、来源、附件类型覆盖及劳务补充项；不合法时提示修正',
    ofd: '同号 OFD 与 PDF/XML 合并；单独 OFD 读取不到内嵌发票 XML 时，提示提供 PDF 或 XML 版',
    'unrecognized-pdf': 'PDF 不能解析为发票或海外收据，也未按文件名识别附件类型时 → 提示人工确认',
  };
  const extra = definition.config
    .filter((f) => f.path.startsWith('labor.'))
    .map((field) => {
      const value = field.path
        .split('.')
        .reduce<unknown>((v, key) => (v as Record<string, unknown>)[key], config);
      return Array.isArray(value) ? `${field.label}：${list(value as string[])}` : '';
    })
    .filter(Boolean);
  if (currentRule.kind === 'laborStandard') {
    for (const [name, rows] of [
      ['咨询标准', currentRule.consultation],
      ['其他劳务标准', currentRule.other],
    ] as const) {
      const labels = (key: string, value: string) =>
        LABOR_CATALOG.flatMap((field) => field.columns ?? [])
          .find((column) => column.key === key)
          ?.options?.find((option) => option.value === value)?.label ?? value;
      const values = rows.map((row) =>
        'min' in row
          ? `${labels('fund', row.fund)} · ${labels('scope', row.scope)} · ${labels('rank', row.rank)} · ${labels('period', row.period)} ${row.min}–${row.max} 元（${labels('taxBasis', row.taxBasis)}）`
          : `${LABOR_TYPES[row.type]} · ${labels('role', row.role)} ≤ ${row.max} 元/人·${row.unit}`,
      );
      extra.push(`${name}：${list(values)}`);
    }
  }
  return [
    declarativeCriteria(currentRule, list) ?? bodies[id],
    ...extra,
    ...(config.ruleOptions[id].enabled ? [] : ['当前已停用，保存后不检查']),
  ].join('；');
}
