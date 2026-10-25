import type { RuleDefinition } from '../../../core/rules/catalog.js';

export const SOURCE_GROUPS = {
  readme: 'README 规则',
  finance: '财务补充',
  labor: '劳务费',
  practice: '课题组惯例',
  system: '系统检查',
};
export const KIND_GROUPS = {
  threshold: '阈值规则',
  keyword: '关键字规则',
  taxCategory: '税目规则',
  party: '购买方',
  duplicate: '重复票',
  lookup: '拒票',
  laborStandard: '劳务标准',
  coded: '组合判定',
  passthrough: '解析诊断',
};
export type RuleGrouping = 'source' | 'kind';
export const groupOf = (rule: RuleDefinition, grouping: RuleGrouping) =>
  grouping === 'kind' ? rule.kind : rule.id.startsWith('L') ? 'labor' : rule.source.kind;
