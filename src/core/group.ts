import { dirname, join, relative, sep } from 'node:path';
import type { Group, Invoice } from './types.js';
import { containsAny, isAiInvoice, isDelegatedGroup, type RuleConfig } from './rules/config.js';

export function groupName(batchDir: string, file: string): string {
  const parts = relative(batchDir, file).split(sep);
  return parts.length > 1 ? parts[0]! : '根目录';
}
export function createGroups(
  batchDir: string,
  files: string[],
  invoices: Invoice[],
  config: RuleConfig,
): Group[] {
  const names = new Set(files.map((file) => groupName(batchDir, file)));
  return [...names].sort().map((name) => {
    const groupInvoices = invoices.filter((i) => groupName(batchDir, i.sources[0]!.path) === name);
    return {
      id: name,
      name,
      dir: name === '根目录' ? batchDir : join(batchDir, name),
      invoiceNumbers: groupInvoices.map((i) => i.number),
      flags: {
        deferred: containsAny(name, config.groupKeywords.deferred),
        bankTransfer: containsAny(name, config.groupKeywords.bankTransfer),
        outsourced: isDelegatedGroup(name, groupInvoices, config),
        ai:
          config.groupKeywords.ai.some((k) => name.toLowerCase() === k.toLowerCase()) ||
          groupInvoices.some(
            (i) => i.kind !== 'domestic' || i.currency !== 'CNY' || isAiInvoice(i, config),
          ),
      },
    };
  });
}
export const invoiceDirectories = (invoice: Invoice): string[] => [
  ...new Set(invoice.sources.map((s) => dirname(s.path))),
];
