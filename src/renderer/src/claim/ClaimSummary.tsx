import styles from './claim.module.css';
import uiStyles from '../styles/ui.module.css';
import { Money, money } from '../ui.js';
import { countSeverities } from '../../../core/report.js';
import type { Report } from '../../../core/types.js';
import type { ClaimState } from '../../../core/domain/claim.js';

export function ClaimSummary({
  report,
  pending,
  submitted,
  state,
  dir,
}: {
  report: Report;
  pending: number;
  submitted: boolean;
  state: ClaimState;
  dir: string;
}) {
  const counts = countSeverities(report.findings);
  const metrics = [
    ['CNY 合计', '¥ ' + money(report.totalCny)],
    ['张数', report.invoiceCount],
    ['待手填', pending],
    ['错误', counts.error],
    ['警告', counts.warning],
    ['已豁免', report.findings.filter((finding) => finding.resolution === 'waived').length],
  ] as const;
  return (
    <div className={styles.summaryStrip} data-testid="batch-summary">
      <div className={styles.summaryLine}>
        {metrics.map(([label, value]) => (
          <div className={styles.summaryMetric} key={label} data-metric={label}>
            <strong>{value}</strong>
            <span className={styles.summaryLabel}>{label}</span>
          </div>
        ))}
      </div>
      <div className={styles.summaryLine}>
        {report.totals.map((t) => (
          <span key={t.expenseContent}>
            {t.expenseContent} ¥ <Money value={t.amount} />
          </span>
        ))}
        <span className={uiStyles.muted}>
          {submitted ? '✓ 已有学校报销单' : '未找到学校报销单'}
        </span>
      </div>
      {submitted && ['draft', 'ready'].includes(state) && (
        <p className={uiStyles.muted}>已找到学校报销单，可标记为已提交</p>
      )}
      {(report.unconverted.length > 0 || report.deferredGroups.length > 0) && (
        <details className={uiStyles.small}>
          <summary>
            未折算 {report.unconverted.length} 张 · 暂缓 {report.deferredGroups.length}{' '}
            组（均不计合计）
          </summary>
          {report.unconverted.map(({ invoice }) => (
            <p key={invoice.number}>
              {invoice.seller.name} · {invoice.currency} <Money value={invoice.total} /> ·{' '}
              {invoice.number}
            </p>
          ))}
          {report.deferredGroups.map((g) => (
            <p key={g.group.id}>
              暂缓组 {g.group.name} · ¥ <Money value={g.totalCny} />
              {g.unconverted.length ? ` · 另有 ${g.unconverted.length} 张未折算` : ''}
            </p>
          ))}
        </details>
      )}
      <p className={uiStyles.path + ' ' + styles.summaryPath + ' ' + uiStyles.small}>{dir}</p>
    </div>
  );
}
