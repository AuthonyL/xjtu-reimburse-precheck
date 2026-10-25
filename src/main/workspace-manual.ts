import type { Batch, ManualEntry } from '../core/types.js';
import type { ManualTask } from '../shared/api.js';
import { findManualEntry } from '../core/manual.js';

export function manualTasks(batch: Batch, rateType: string): ManualTask[] {
  const tasks: ManualTask[] = [];
  for (const group of batch.groups) {
    const invoices = batch.invoices.filter((i) => group.invoiceNumbers.includes(i.number));
    for (const invoice of invoices.filter((i) => i.kind !== 'domestic' || i.currency !== 'CNY')) {
      const saved = findManualEntry(batch, invoice);
      const source = invoice.sources.find((s) => s.format !== 'manual');
      tasks.push({
        key: invoice.number,
        group: group.name,
        label: invoice.seller.name || invoice.number,
        entry: {
          group: group.name,
          currency: invoice.currency,
          amount: invoice.total,
          paymentDate: invoice.date,
          exchangeRateType: rateType,
          ...saved,
          number: saved ? saved.number : invoice.number,
          sourceFile: saved ? saved.sourceFile : source?.relativePath,
        },
        pending:
          !invoice.date ||
          (invoice.currency !== 'CNY' &&
            (!saved?.exchangeRate ||
              saved.currency !== invoice.currency ||
              saved.paymentDate !== invoice.date ||
              (!!saved.exchangeRateType && saved.exchangeRateType !== rateType))),
      });
    }
    const unknown = group.flags.ai
      ? batch.attachments.filter(
          (a) =>
            a.type === 'unnamed' &&
            (group.name === '根目录'
              ? !a.relativePath.includes('/')
              : a.relativePath.startsWith(group.name + '/')),
        )
      : [];
    for (const file of unknown)
      tasks.push({
        key: 'file:' + file.relativePath,
        group: group.name,
        label: file.relativePath,
        entry: {
          group: group.name,
          sourceFile: file.relativePath,
          currency: 'USD',
          exchangeRateType: rateType,
        },
        pending: true,
      });
    if (group.flags.ai && !invoices.length && !unknown.length)
      tasks.push({
        key: 'group:' + group.name,
        group: group.name,
        label: '未读取到收据，请填实际支付记录',
        entry: {
          group: group.name,
          number: 'manual:desktop:' + group.name,
          currency: 'USD',
          exchangeRateType: rateType,
        },
        pending: true,
      });
  }
  return tasks;
}
