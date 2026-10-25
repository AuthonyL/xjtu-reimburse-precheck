import type { AttachmentType, Group, Invoice, Party, Severity } from '../types.js';
import type { ConsultationStandard, OtherLaborStandard } from '../labor/types.js';
import type { RuleId, Threshold } from './config.js';
import type { EvalContext } from './engine/context.js';

export type Scope = 'line' | 'invoice' | 'sellerDay' | 'group' | 'batch' | 'workspace';
export type Stage = 'diagnostics' | 'invoice' | 'group' | 'workspace' | 'labor';
export type Target = 'invoice' | 'delegated' | 'highValue';
export type Effect =
  | {
      kind: 'require';
      attachment: AttachmentType;
      reason: string;
      aggregation?: 'sellerDay';
      coversSubsets?: boolean;
    }
  | { kind: 'finding'; message: string; code?: string };
export interface RuleBase {
  id: RuleId;
  kind: string;
  enabled: boolean;
  severity: Severity;
  restrictive: boolean;
  scope: Scope;
  stage: Stage;
  validFrom?: string;
  validTo?: string;
  appliesTo?: {
    kinds?: Invoice['kind'][];
    currency?: string[];
    physicalOnly?: boolean;
    groupFlags?: Partial<Group['flags']>;
    notGroupFlags?: Partial<Group['flags']>;
    excludeNamedAiGroup?: boolean;
    excludeNamedOutsourcedGroup?: string[];
    requireHighValue?: boolean;
  };
}
export interface ThresholdRule extends RuleBase {
  kind: 'threshold';
  threshold: Threshold;
  measure: 'total' | 'grossUnitPrice' | 'delegatedTotal' | 'groupTotal';
  period: 'invoice' | 'day' | 'group';
  target?: Target;
  effect: Effect | Effect[];
  highUnit?: Threshold;
  physicalCategories?: { exempt: string[]; service: string[] };
  missingAggregation?: { message: string };
}
export interface KeywordRule extends RuleBase {
  kind: 'keyword';
  keywords: string[];
  field: 'ruleText' | 'lineName' | 'groupName' | 'invoiceText';
  sameDirectoryOnly?: boolean;
  match?: 'contains' | 'unmappedExpense' | 'legacy';
  unknownExpense?: string;
  target?: Target;
  effect: Effect;
}
export interface TaxCategoryRule extends RuleBase {
  kind: 'taxCategory';
  categories: string[];
  match: 'delegated' | 'physical';
  serviceCategories?: string[];
  target?: Target;
  expenseContent?: string;
  groupKeywords?: string[];
  effect: Effect;
}
export interface PartyRule extends RuleBase {
  kind: 'party';
  party: 'buyer';
  expected: Party;
}
export interface DuplicateRule extends RuleBase {
  kind: 'duplicate';
  scopes: ('batch' | 'workspace' | 'history')[];
}
export interface LookupRule extends RuleBase {
  kind: 'lookup';
  set: 'rejected';
}
export interface LaborStandardRule extends RuleBase {
  kind: 'laborStandard';
  consultation: ConsultationStandard[];
  other: OtherLaborStandard[];
}
// 劳务的编码判定仍由 checkLabor 执行，只从同一 registry 读取参数。
export type CodedRule = RuleBase & { kind: 'coded' } & (
    { executor: 'batch'; run(ctx: EvalContext): void } | { executor: 'labor' }
  );
export interface PassthroughRule extends RuleBase {
  kind: 'passthrough';
}
export type Rule =
  | ThresholdRule
  | KeywordRule
  | TaxCategoryRule
  | PartyRule
  | DuplicateRule
  | LookupRule
  | LaborStandardRule
  | CodedRule
  | PassthroughRule;
export type RuleRegistry = ReadonlyMap<RuleId, Rule>;
export function ruleOption(rules: RuleRegistry, id: RuleId): Rule {
  const rule = rules.get(id);
  if (!rule) throw new Error(`规则未登记：${id}`);
  return rule;
}
