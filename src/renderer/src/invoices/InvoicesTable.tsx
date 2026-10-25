import { ClaimBadge } from '../claim/ClaimStatus.js';
import { Hint, Money, money, Pill, TextButton } from '../ui.js';
import { useRouteStore } from '../store/route.js';
import type { InvoiceRow, InvoiceSort } from './invoice-rows.js';
import styles from './invoices.module.css';

export function InvoicesTable({
  rows,
  title,
  duplicates,
  sort,
  onSort,
  reference = false,
}: {
  rows: InvoiceRow[];
  title: string;
  duplicates: Map<string, number>;
  sort: InvoiceSort;
  onSort: (column: InvoiceSort['column']) => void;
  reference?: boolean;
}) {
  const select = useRouteStore((state) => state.select);
  const sortable = (column: InvoiceSort['column'], label: string) => (
    <th scope="col" aria-sort={sort.column === column ? sort.direction : 'none'}>
      <TextButton aria-label={label} onClick={() => onSort(column)}>
        {label}
        {sort.column === column ? (sort.direction === 'ascending' ? ' ↑' : ' ↓') : ' ↕'}
      </TextButton>
    </th>
  );
  return (
    <div className={styles.tableScroll} role="region" aria-label={title + '表格'} tabIndex={0}>
      <table aria-label={title}>
        <thead>
          <tr>
            {sortable('date', '开票日期')}
            <th scope="col">发票号</th>
            {sortable('seller', '销方')}
            {sortable('amount', '金额')}
            <th scope="col">支出内容</th>
            <th scope="col">所属批次</th>
            <th scope="col">分组</th>
            <th scope="col">报销状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const count = duplicates.get(row.invoice.number) ?? 0;
            return (
              <tr key={row.key}>
                <td>{row.invoice.date || '待填'}</td>
                <td className={styles.number}>
                  {row.invoice.number || '未填号码'}
                  {!reference && count > 1 && (
                    <Hint text={`在 ${count} 个批次出现`}>
                      <span className={styles.duplicate} aria-label={`在 ${count} 个批次出现`}>
                        <Pill tone="warning">重复号</Pill>
                      </span>
                    </Hint>
                  )}
                </td>
                <td>{row.invoice.seller.name || '待填'}</td>
                <td className={styles.amount}>
                  {row.invoice.currency === 'CNY' ? (
                    <>
                      ¥ <Money value={row.invoice.total} />
                    </>
                  ) : (
                    `${row.invoice.currency} ${money(row.invoice.total)}`
                  )}
                </td>
                <td>{row.expenseContent || '待分类'}</td>
                <td>
                  <TextButton onClick={() => select(row.batchDir, row.group)}>
                    {row.batchId}
                  </TextButton>
                </td>
                <td>{row.group}</td>
                <td>{reference ? <Pill>参考</Pill> : <ClaimBadge state={row.state} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
