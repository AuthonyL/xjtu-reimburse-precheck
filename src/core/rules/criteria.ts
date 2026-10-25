import { ATTACHMENT_LABELS as attachmentLabels } from './catalog.js';
import type { Rule, Effect, ThresholdRule } from './model.js';
import type { Threshold } from './config.js';

export type KeywordList = (values: string[]) => string;
const levels = { error: '错误', warning: '警告', info: '提示' };
const amount = (t: Threshold) => `${t.operator === '>=' ? '≥' : '>'} ${t.value} 元`;
const effectText = (effect: Effect) =>
  effect.kind === 'require' ? attachmentLabels[effect.attachment] : '人工确认';
function thresholdCriteria(rule: ThresholdRule, list: KeywordList): string {
  const effects = (Array.isArray(rule.effect) ? rule.effect : [rule.effect])
    .map(effectText)
    .join('和');
  const physical = rule.physicalCategories
    ? `（豁免税目：${list(rule.physicalCategories.exempt)}；服务类税目：${list(rule.physicalCategories.service)}）`
    : '';
  const invoice = rule.appliesTo?.physicalOnly ? '人民币实物发票' : '国内发票';
  const measure =
    rule.measure === 'delegatedTotal'
      ? '委托组人民币合计'
      : rule.measure === 'groupTotal'
        ? '人民币组合计'
        : rule.measure === 'grossUnitPrice'
          ? '明细含税单价'
          : rule.period === 'day'
            ? `整个批次内，同一销方、同一开票日${rule.appliesTo?.physicalOnly ? '、同币种合计' : '人民币发票合计'}`
            : `单张${invoice}价税合计`;
  const prerequisite = rule.highUnit
    ? `组内有含税单价 ${amount(rule.highUnit)} 的实物明细，且`
    : '';
  const daily = rule.period === 'day' ? '；组内按销方和日期合并' : '';
  const target = rule.appliesTo?.physicalOnly && rule.period === 'day' ? '其中人民币实物票' : '';
  const delegated = rule.measure === 'delegatedTotal' ? '；AI 组和 AI 订阅除外' : '';
  return `${prerequisite}${measure} ${amount(rule.threshold)} → ${target}需要${effects}${daily}${delegated}${physical}`;
}
/** 声明式判定说明只读取 Rule，编码规则继续由目录保留手写说明。 */
export function declarativeCriteria(rule: Rule, list: KeywordList): string | undefined {
  switch (rule.kind) {
    case 'threshold':
      return thresholdCriteria(rule, list);
    case 'keyword': {
      if (rule.match === 'unmappedExpense')
        return `按当前映射建议支出内容；映射关键字：${list(rule.keywords)}；无明细或不能判断时建议「${rule.unknownExpense}」并提示人工确认`;
      if (rule.match === 'legacy')
        return `发票文字包含旧版识别文字 ${list(rule.keywords)} → 确认发票专用章；没有发票文字时按旧版票类型判断`;
      const field =
        rule.field === 'groupName'
          ? '组名'
          : rule.field === 'lineName'
            ? '品名'
            : rule.field === 'invoiceText'
              ? '发票文字'
              : '税目、品名或文件名';
      const effect =
        rule.effect.kind === 'finding' ? levels[rule.severity] : `需要${effectText(rule.effect)}`;
      const local = rule.sameDirectoryOnly ? '；仅同目录' : '';
      const target =
        rule.target === 'delegated' ? '；仅服务税目命中时由 R5 要求清单；AI 组除外' : '';
      const fund = rule.effect.kind === 'finding' ? '；不区分批次经费类型' : '';
      return `${field}包含：${list(rule.keywords)} → ${effect}${local}${target}${fund}`;
    }
    case 'taxCategory':
      return rule.match === 'delegated'
        ? `明细税目包含 ${list(rule.categories)} → ${rule.expenseContent}，需对方盖章的明细清单；没有税目时按税目、品名或文件名兜底；AI 除外`
        : `组名含 ${list(rule.groupKeywords ?? [])}，且不含委托分组关键字 ${list(rule.appliesTo?.excludeNamedOutsourcedGroup ?? [])} → 实物器件需入库（豁免税目：${list(rule.categories)}；服务类税目：${list(rule.serviceCategories ?? [])}）`;
    case 'party':
      return `国内发票购买方名称应为「${rule.expected.name}」、税号应为「${rule.expected.taxId}」；名称去空白后比对，税号合法长度为 15/17/18/20 位，读不全时仅比名称`;
    case 'duplicate':
      return `${rule.scopes.map((s) => ({ batch: '同一批次内不同目录或同格式重复', workspace: '其他批次同号', history: '已提交历史同号', checksum: '文件内容相同但发票号不同' })[s]).join('、')} → 重复；PDF/XML/OFD 同号不同格式可合并`;
    case 'lookup':
      return '发票号出现在无法报销费用集合 → 优先显示已记录原因，否则推断本票规则原因，均无时提示未记录';
    default:
      return undefined;
  }
}
