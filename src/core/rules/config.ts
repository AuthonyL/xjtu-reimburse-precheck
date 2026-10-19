import defaults from './defaults.json' with { type: 'json' };
import type { AttachmentType, Invoice, Severity } from '../types.js';
import type { LaborConfig, ConsultationStandard, OtherLaborStandard } from '../labor/types.js';
import { validateLaborStandards } from '../labor/validation.js';

export type RuleId = keyof typeof defaults.ruleOptions;

export interface Threshold {
  value: number;
  operator: '>=' | '>';
}
export interface RuleConfig {
  transportKeywords: string[];
  deliveryKeywords: string[];
  mixedDelegatedSeverity: Severity;
  labor: LaborConfig;
  laborStandards: { consultation: ConsultationStandard[]; other: OtherLaborStandard[] };
  buyer: { name: string; taxId: string };
  thresholds: Record<
    'inventory' | 'payment' | 'verification' | 'highUnit' | 'highGroup' | 'outsourcedContract',
    Threshold
  >;
  exemptTaxCategories: string[];
  aiKeywords: string[];
  storeKeywords: string[];
  designKeywords: string[];
  horizontalOnlyKeywords: string[];
  purposeKeywords: string[];
  serviceTaxCategories: string[];
  legacyInvoiceKeywords: string[];
  ruleOptions: Record<RuleId, { enabled: boolean; severity: Severity }>;
  instrumentKeywords: string[];
  groupKeywords: Record<'deferred' | 'bankTransfer' | 'outsourced' | 'ai' | 'labor', string[]>;
  attachmentKeywords: Record<AttachmentType, string[]>;
  materialDirectoryKeywords: string[];
  unconfirmedAttachmentTypes: AttachmentType[];
  ignoredExtensions: string[];
  exchangeRateType: string;
  expense: {
    default: string;
    ai: string;
    outsourced: string;
    unknown: string;
    mappings: { keywords: string[]; content: string }[];
  };
  highValueReasons: string[];
}
export type DeepPartial<T> = T extends unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;
function merge(base: unknown, override: unknown): unknown {
  if (override === undefined) return structuredClone(base);
  if (
    base &&
    typeof base === 'object' &&
    !Array.isArray(base) &&
    override &&
    typeof override === 'object' &&
    !Array.isArray(override)
  ) {
    const out = structuredClone(base) as Record<string, unknown>;
    for (const [key, value] of Object.entries(override)) {
      if (!Object.hasOwn(out, key)) throw new Error(`未知配置项：${key}`);
      out[key] = merge(out[key], value);
    }
    return out;
  }
  return structuredClone(override);
}
function validateShape(value: unknown, template: unknown, path = 'config'): void {
  if (Array.isArray(template)) {
    if (!Array.isArray(value) || (!value.length && path === 'config.highValueReasons'))
      throw new Error(`配置 ${path} 必须为数组（理由库至少一条）`);
    for (const v of value) validateShape(v, template[0], path + '[]');
  } else if (template && typeof template === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`配置 ${path} 必须为对象`);
    for (const [key, t] of Object.entries(template))
      validateShape((value as Record<string, unknown>)[key], t, path + '.' + key);
  } else if (typeof value !== typeof template || (typeof value === 'string' && !value.trim()))
    throw new Error(`配置 ${path} 类型或内容不合法`);
}
export function loadConfig(
  overrides: DeepPartial<RuleConfig> & { forbiddenKeywords?: string[] } = {},
): RuleConfig {
  const incoming = structuredClone(overrides);
  if (!Object.hasOwn(incoming, 'ruleOptions')) {
    if (
      JSON.stringify(incoming.exemptTaxCategories) ===
      JSON.stringify(defaults.exemptTaxCategories.slice(0, -5))
    )
      incoming.exemptTaxCategories = structuredClone(defaults.exemptTaxCategories);
    if (
      JSON.stringify(incoming.designKeywords) ===
      JSON.stringify(defaults.designKeywords.slice(0, 2))
    )
      incoming.designKeywords = structuredClone(defaults.designKeywords);
    if (
      JSON.stringify(incoming.groupKeywords?.outsourced) ===
      JSON.stringify(defaults.groupKeywords.outsourced.slice(0, 1))
    )
      incoming.groupKeywords!.outsourced = structuredClone(defaults.groupKeywords.outsourced);
  }
  if (!incoming.ruleOptions?.T1) {
    if (
      JSON.stringify(incoming.horizontalOnlyKeywords) ===
      JSON.stringify(defaults.horizontalOnlyKeywords.slice(0, -7))
    )
      incoming.horizontalOnlyKeywords = structuredClone(defaults.horizontalOnlyKeywords);
    if (
      JSON.stringify(incoming.attachmentKeywords?.waybill) ===
      JSON.stringify(['运单明细', '顺丰行程单'])
    )
      incoming.attachmentKeywords!.waybill = structuredClone(defaults.attachmentKeywords.waybill);
  }
  const legacy = incoming.forbiddenKeywords;
  delete incoming.forbiddenKeywords;
  if (legacy !== undefined) {
    if (!Array.isArray(legacy) || legacy.some((v) => typeof v !== 'string' || !v.trim()))
      throw new Error('旧配置 forbiddenKeywords 必须为关键字数组');
    incoming.horizontalOnlyKeywords = [
      ...new Set([
        ...(incoming.horizontalOnlyKeywords ?? defaults.horizontalOnlyKeywords),
        ...legacy,
      ]),
    ];
  }
  const value = merge(defaults, incoming);
  validateShape(value, defaults);
  const config = value as RuleConfig;
  if (!['error', 'warning', 'info'].includes(config.mixedDelegatedSeverity))
    throw new Error('混合委托发票级别不合法');
  validateLaborStandards(config);
  for (const [id, option] of Object.entries(config.ruleOptions))
    if (!['error', 'warning', 'info'].includes(option.severity))
      throw new Error(`规则 ${id} 的级别不合法`);
  if (
    config.unconfirmedAttachmentTypes.some(
      (type) => !Object.hasOwn(config.attachmentKeywords, type),
    )
  )
    throw new Error('待确认材料类型不合法');
  for (const [key, t] of Object.entries(config.thresholds))
    if (!Number.isFinite(t.value) || t.value < 0 || !['>=', '>'].includes(t.operator))
      throw new Error(`阈值 ${key} 不合法`);
  return config;
}
export const meets = (value: number, threshold: Threshold): boolean =>
  threshold.operator === '>=' ? value >= threshold.value - 1e-8 : value > threshold.value + 1e-8;
export const containsAny = (text: string, keywords: readonly string[]): boolean =>
  keywords.some((k) => text.toLowerCase().includes(k.toLowerCase()));
export const isAiInvoice = (invoice: Invoice, config: RuleConfig): boolean =>
  containsAny(invoice.lines.map((l) => l.name).join(' '), config.aiKeywords);

export const invoiceRuleText = (invoice: Invoice): string =>
  [
    ...invoice.lines.map((line) => `${line.taxCategory} ${line.name}`),
    ...invoice.sources.map((source) => source.relativePath.split(/[\\/]/).at(-1) ?? ''),
  ].join(' ');
export const matchesServiceCategory = (category: string, keywords: readonly string[]): boolean => {
  const normalized = category.replace(/\s/g, '').toLowerCase();
  return keywords.some(
    (keyword) =>
      normalized === keyword.toLowerCase() ||
      normalized.endsWith(keyword.toLowerCase()) ||
      (keyword.length > 2 && normalized.includes(keyword.toLowerCase())),
  );
};
export const isDelegatedInvoice = (invoice: Invoice, config: RuleConfig): boolean => {
  if (invoice.kind !== 'domestic' || isAiInvoice(invoice, config)) return false;
  return invoice.lines.some((line) => line.taxCategory)
    ? invoice.lines.some((line) => matchesServiceCategory(line.taxCategory, config.designKeywords))
    : containsAny(invoiceRuleText(invoice), config.designKeywords);
};
export const isDelegatedGroup = (
  name: string,
  invoices: Invoice[],
  config: RuleConfig,
): boolean => {
  if (
    config.groupKeywords.ai.some((keyword) => name.toLowerCase() === keyword.toLowerCase()) ||
    (invoices.length > 0 &&
      invoices.every(
        (invoice) =>
          invoice.kind !== 'domestic' || invoice.currency !== 'CNY' || isAiInvoice(invoice, config),
      ))
  )
    return false;
  return (
    containsAny(name, config.groupKeywords.outsourced) ||
    invoices.some((invoice) => isDelegatedInvoice(invoice, config))
  );
};
