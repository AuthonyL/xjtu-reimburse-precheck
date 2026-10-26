import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../store/workspace.js';
import { Money, PageHeader } from '../ui.js';
import {
  duplicateBatches,
  emptyFilter,
  filterInvoices,
  invoiceRows,
  invoiceSummary,
  type InvoiceSort,
} from './invoice-rows.js';
import { InvoiceFilters } from './InvoiceFilters.js';
import { InvoicesTable } from './InvoicesTable.js';
import styles from './invoices.module.css';

export function InvoicesPage() {
  const view = useWorkspaceStore((state) => state.view);
  const all = useMemo(() => invoiceRows(view), [view]);
  const duplicates = useMemo(() => duplicateBatches(all.regular), [all]);
  const contents = useMemo(
    () =>
      [
        ...new Set(
          [...all.regular, ...all.reference].map((row) => row.expenseContent).filter(Boolean),
        ),
      ].sort(),
    [all],
  );
  const [filter, setFilter] = useState(emptyFilter);
  const [sort, setSort] = useState<InvoiceSort>({ column: 'date', direction: 'descending' });
  const regular = useMemo(() => filterInvoices(all.regular, filter, sort), [all, filter, sort]);
  const reference = useMemo(() => filterInvoices(all.reference, filter, sort), [all, filter, sort]);
  const summary = invoiceSummary(regular);
  const onSort = (column: InvoiceSort['column']) =>
    setSort((current) => ({
      column,
      direction:
        current.column === column && current.direction === 'ascending' ? 'descending' : 'ascending',
    }));
  return (
    <main className={styles.page}>
      <PageHeader
        title="发票列表"
        subtitle={
          <span className={styles.summary} data-testid="invoices-summary">
            {summary.count} 张 · CNY 合计 ¥ <Money value={summary.cny} />
            {summary.foreign > 0 && <span> · 外币 {summary.foreign} 张未折算</span>}
          </span>
        }
      />
      <InvoiceFilters filter={filter} onChange={setFilter} contents={contents} />
      <section aria-label="工作区发票">
        <InvoicesTable
          title="工作区发票"
          rows={regular}
          duplicates={duplicates}
          sort={sort}
          onSort={onSort}
        />
        {!regular.length && <p className={styles.empty}>没有符合筛选条件的发票。</p>}
      </section>
      {all.reference.length > 0 && (
        <section aria-label="无法报销费用（参考）">
          <h2>无法报销费用（参考）</h2>
          <p className={styles.note}>参考票不计入上方张数与合计。</p>
          <InvoicesTable
            title="无法报销费用（参考）"
            rows={reference}
            duplicates={duplicates}
            sort={sort}
            onSort={onSort}
            reference
          />
          {!reference.length && <p className={styles.empty}>没有符合筛选条件的参考票。</p>}
        </section>
      )}
    </main>
  );
}
