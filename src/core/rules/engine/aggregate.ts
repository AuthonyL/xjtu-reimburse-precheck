import type { Batch, CheckedGroup, Group, Invoice, InvoiceLine } from '../../types.js';
import { roundMoney } from '../../parse/common.js';
import {
  containsAny,
  isAiInvoice,
  isDelegatedInvoice,
  isDelegatedGroup,
  invoiceRuleText,
  matchesServiceCategory,
  meets,
  type RuleConfig,
} from '../config.js';
import { findManualEntry } from '../../manual.js';
import { groupName } from '../../group.js';
import type { Aggregates, GroupAggregate, InvoiceAggregate } from './context.js';
export type { Aggregates, GroupAggregate } from './context.js';
import { matchItineraries } from '../travel.js';

const textOf = invoiceRuleText;
export const namedAi = (group: Group, config: RuleConfig): boolean =>
  config.groupKeywords.ai.some((k) => group.name.toLowerCase() === k.toLowerCase());
export function isPhysicalLine(line: InvoiceLine, config: RuleConfig): boolean {
  return (
    !containsAny(line.taxCategory || line.name, config.exemptTaxCategories) &&
    !matchesServiceCategory(line.taxCategory, config.serviceTaxCategories)
  );
}
const design = isDelegatedInvoice;
export function sellerDay(invoice: Invoice, idsByName: Map<string, Set<string>>): string | null {
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

export function aggregate(batch: Batch, config: RuleConfig): Aggregates {
  const idsByName = new Map<string, Set<string>>();
  for (const invoice of batch.invoices)
    if (invoice.seller.name && invoice.seller.taxId) {
      const name = invoice.seller.name.trim().replace(/\s/g, '');
      const ids = idsByName.get(name) ?? new Set<string>();
      ids.add(invoice.seller.taxId);
      idsByName.set(name, ids);
    }
  const keys = new Map<Invoice, string | null>();
  const daily = new Map<string, number>();
  const invoices = new Map<Invoice, InvoiceAggregate>();
  for (const invoice of batch.invoices) {
    const key = sellerDay(invoice, idsByName);
    keys.set(invoice, key);
    if (key) daily.set(key, roundMoney((daily.get(key) ?? 0) + invoice.total));
    invoices.set(invoice, {
      physical: invoice.kind === 'domestic' && invoice.lines.some((l) => isPhysicalLine(l, config)),
      highValueLines:
        invoice.kind === 'domestic'
          ? invoice.lines.flatMap((l, n) =>
              isPhysicalLine(l, config) &&
              l.grossUnitPrice !== null &&
              meets(l.grossUnitPrice, config.thresholds.highUnit)
                ? [n]
                : [],
            )
          : [],
    });
  }
  const groups = batch.groups.map((original): GroupAggregate => {
    const members = batch.invoices.filter((i) => original.invoiceNumbers.includes(i.number));
    const group: Group = {
      ...original,
      flags: { ...original.flags, outsourced: isDelegatedGroup(original.name, members, config) },
    };
    const delegatedInvoices = members.filter(
      (i) => i.kind === 'domestic' && i.currency === 'CNY' && !isAiInvoice(i, config),
    );
    return {
      images: [...batch.unidentified, ...batch.attachments.filter((a) => a.type === 'unnamed')]
        .filter(
          (f) =>
            groupName(batch.dir, f.path) === group.name &&
            /\.(png|jpe?g|webp|heic|tiff?|bmp)$/i.test(f.path),
        )
        .map((f) => f.path),
      group,
      invoices: members,
      namedAi: namedAi(original, config),
      delegatedInvoices,
      high: members.filter((i) => invoices.get(i)!.highValueLines.length),
      groupTotal: roundMoney(
        members.filter((i) => i.currency === 'CNY').reduce((sum, i) => sum + i.total, 0),
      ),
      delegatedTotal: roundMoney(delegatedInvoices.reduce((sum, i) => sum + i.total, 0)),
      expenseContent: new Map(members.map((i) => [i, expense(i, group, config)])),
    };
  });
  return {
    sellerDay: keys,
    daily,
    invoices,
    groups,
    manualEntries: new Map(
      batch.invoices.map((invoice) => [invoice, findManualEntry(batch, invoice)]),
    ),
    travelMatches: matchItineraries(
      batch,
      batch.invoices.filter(
        (i) => i.kind === 'domestic' && containsAny(textOf(i), config.transportKeywords),
      ),
    ),
  };
}
export function finishExpense(checked: CheckedGroup, config: RuleConfig): void {
  const contents = [...new Set(checked.invoices.map((i) => i.expenseContent))];
  checked.expenseContent =
    contents.length === 1
      ? contents[0]!
      : contents.length > 1
        ? '混合（按发票分类）'
        : checked.group.flags.ai
          ? config.expense.ai
          : config.expense.unknown;
}
