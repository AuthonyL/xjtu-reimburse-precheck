import { useState } from 'react';
import { Collapsible } from 'radix-ui';
import type { BatchView } from '../../../shared/api.js';
import { countSeverities } from '../../../core/report.js';
import { displayTime, latestTransition } from '../../../core/export/ledger.js';
import { Money, TextButton } from '../ui.js';
import { ClaimBadge } from '../claim/ClaimStatus.js';
import { useRouteStore } from '../store/route.js';
import styles from './overview.module.css';

export function OverviewRow({
  row,
  checked,
  onCheck,
}: {
  row: BatchView;
  checked: boolean;
  onCheck: (checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const select = useRouteStore((state) => state.select);
  const { batch, report, claim } = row;
  const dates = batch.invoices
    .map((invoice) => invoice.date)
    .filter(Boolean)
    .sort();
  const first = dates[0];
  const last = dates.at(-1);
  const date = first ? (first === last ? first : `${first} ～ ${last}`) : batch.batchDate || '—';
  const counts = countSeverities(report.findings);
  return (
    <Collapsible.Root asChild open={open} onOpenChange={setOpen}>
      <tbody>
        <tr>
          <td>
            <input
              type="checkbox"
              aria-label={'选择 ' + batch.id}
              checked={checked}
              disabled={row.readOnly}
              onChange={(event) => onCheck(event.target.checked)}
            />
          </td>
          <td>
            <TextButton onClick={() => select(batch.dir)}>{batch.id}</TextButton>
            <Collapsible.Trigger asChild>
              <TextButton aria-label={(open ? '收起' : '展开') + '支出合计 ' + batch.id}>
                {open ? '▾' : '▸'} 合计
              </TextButton>
            </Collapsible.Trigger>
          </td>
          <td>
            <ClaimBadge state={claim.state} />
          </td>
          <td>{date}</td>
          <td>{report.invoiceCount}</td>
          <td className={styles.amount}>
            <Money value={report.totalCny} />
          </td>
          <td>
            <span className="error">{counts.error}</span> /{' '}
            <span className="warning">{counts.warning}</span> / {row.waived}
          </td>
          <td>{batch.submitted ? '有' : '无'}</td>
          <td>{displayTime(latestTransition(claim))}</td>
        </tr>
        <Collapsible.Content asChild>
          <tr>
            <td colSpan={9} className={styles.details}>
              <strong>各支出内容合计</strong>
              {report.totals.map((total) => (
                <div key={total.expenseContent} className={styles.total}>
                  <span>{total.expenseContent}</span>
                  <span>
                    ¥ <Money value={total.amount} />
                  </span>
                </div>
              ))}
              {!report.totals.length && <p>暂无已知人民币金额。</p>}
              {!!report.unconverted.length && <p>另有 {report.unconverted.length} 张未折算</p>}
              {!!report.incompleteGroups.length && (
                <p>另有 {report.incompleteGroups.length} 组待手填金额</p>
              )}
            </td>
          </tr>
        </Collapsible.Content>
      </tbody>
    </Collapsible.Root>
  );
}
