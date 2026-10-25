import type { Invoice } from '../../../core/types.js';
import type { ClaimState } from '../../../core/domain/claim.js';
import type { BatchView, WorkspaceView } from '../../../shared/api.js';

export interface InvoiceRow {
  key: string;
  invoiceKey: string;
  invoice: Invoice;
  batchDir: string;
  batchId: string;
  group: string;
  state: ClaimState;
  expenseContent: string;
}
export interface InvoiceFilter {
  keyword: string;
  states: ClaimState[];
  expenseContent: string;
  start: string;
  end: string;
}
export interface InvoiceSort {
  column: 'date' | 'amount' | 'seller';
  direction: 'ascending' | 'descending';
}
export const emptyFilter: InvoiceFilter = {
  keyword: '',
  states: [],
  expenseContent: '',
  start: '',
  end: '',
};

function batchRows({ batch, report, claim }: BatchView): InvoiceRow[] {
  return batch.invoices.flatMap((invoice, index) => {
    const groups = batch.groups.filter((group) => group.invoiceNumbers.includes(invoice.number));
    const invoiceKey = batch.dir + ':' + index;
    return (groups.length ? groups.map((group) => group.name) : ['根目录']).map((group) => ({
      key: invoiceKey + ':' + group,
      invoiceKey,
      invoice,
      batchDir: batch.dir,
      batchId: batch.id,
      group,
      state: claim.state,
      expenseContent:
        report.groups
          .find((checked) => checked.group.name === group)
          ?.invoices.find((checked) => checked.invoice.number === invoice.number)?.expenseContent ??
        '',
    }));
  });
}
export function invoiceRows(view: WorkspaceView | null) {
  return {
    regular: view?.batches.flatMap(batchRows) ?? [],
    reference: view?.rejected ? batchRows(view.rejected) : [],
  };
}
export function duplicateBatches(rows: InvoiceRow[]) {
  const batches = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.invoice.number.trim()) continue;
    const dirs = batches.get(row.invoice.number) ?? new Set<string>();
    dirs.add(row.batchDir);
    batches.set(row.invoice.number, dirs);
  }
  return new Map([...batches].map(([number, dirs]) => [number, dirs.size]));
}
export function filterInvoices(rows: InvoiceRow[], filter: InvoiceFilter, sort: InvoiceSort) {
  const keyword = filter.keyword.trim().toLocaleLowerCase();
  return rows
    .filter(
      ({ invoice, state, expenseContent }) =>
        (!keyword ||
          [invoice.number, invoice.seller.name, ...invoice.lines.map((line) => line.name)].some(
            (value) => value.toLocaleLowerCase().includes(keyword),
          )) &&
        (!filter.states.length || filter.states.includes(state)) &&
        (!filter.expenseContent || expenseContent === filter.expenseContent) &&
        (!filter.start || (!!invoice.date && invoice.date >= filter.start)) &&
        (!filter.end || (!!invoice.date && invoice.date <= filter.end)),
    )
    .sort((a, b) => {
      if (sort.column === 'date' && (!a.invoice.date || !b.invoice.date))
        return Number(!a.invoice.date) - Number(!b.invoice.date);
      const compared =
        sort.column === 'amount'
          ? a.invoice.total - b.invoice.total
          : sort.column === 'seller'
            ? a.invoice.seller.name.localeCompare(b.invoice.seller.name, 'zh-CN')
            : a.invoice.date.localeCompare(b.invoice.date);
      return sort.direction === 'ascending' ? compared : -compared;
    });
}
export function invoiceSummary(rows: InvoiceRow[]) {
  const invoices = [...new Map(rows.map((row) => [row.invoiceKey, row.invoice])).values()];
  return {
    count: invoices.length,
    cny: invoices
      .filter((invoice) => invoice.currency === 'CNY')
      .reduce((sum, invoice) => sum + invoice.total, 0),
    foreign: invoices.filter((invoice) => invoice.currency !== 'CNY').length,
  };
}
