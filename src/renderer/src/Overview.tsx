import styles from './styles/ui.module.css';
import homeStyles from './styles/home.module.css';
import overviewStyles from './styles/overview.module.css';
import { Money } from './ui.js';
import { useWorkspaceStore } from './store/workspace.js';
import { useRouteStore } from './store/route.js';
import { compareBatches } from '../../core/batch-order.js';
import type { WorkspaceView } from '../../shared/api.js';
import { Counts, money, nameOf } from './ui.js';
import { ClaimBadge } from './claim/ClaimStatus.js';

export function Overview({ view }: { view: WorkspaceView }) {
  const select = useRouteStore((state) => state.select);
  const refresh = useWorkspaceStore((state) => state.refresh);
  return (
    <main>
      <div className={styles.pageHeading}>
        <div>
          <div className={homeStyles.eyebrow}>{view.kind === 'root' ? '根目录' : '工作区'}</div>
          <h1>{nameOf(view.dir)}</h1>
          <p className={styles.path}>{view.dir}</p>
        </div>
        <button onClick={refresh}>全部重新检查</button>
      </div>
      <div className={overviewStyles.batchGrid}>
        {[...view.batches]
          .sort((a, b) => compareBatches(a.batch, b.batch))
          .map((b) => (
            <button
              key={b.batch.dir}
              className={overviewStyles.batchCard}
              onClick={() => select(b.batch.dir)}
            >
              <div className={styles.cardHeading}>
                <h2>{b.batch.id}</h2>
                <ClaimBadge state={b.claim.state} />
                <span>{b.report.invoiceCount} 张</span>
              </div>
              <Counts report={b.report} />
              <p>{b.batch.submitted ? '✓ 已有学校报销单' : '未找到学校报销单'}</p>
              {b.report.totals.map((t) => (
                <div className={overviewStyles.totalRow} key={t.expenseContent}>
                  <span>{t.expenseContent}</span>
                  <strong>
                    ¥ <Money value={t.amount} />
                  </strong>
                </div>
              ))}
              {!!b.report.unconverted.length && (
                <p className={styles.muted}>另有 {b.report.unconverted.length} 张未折算</p>
              )}
            </button>
          ))}
        {view.labor?.map((l) => (
          <button
            className={overviewStyles.batchCard}
            key={l.report.dir}
            onClick={() => select(l.report.dir)}
          >
            <div className={styles.cardHeading}>
              <h2>{l.report.name}</h2>
              <span>
                {l.report.payoutCount} 笔（{l.report.entries.length} 份说明）
              </span>
            </div>
            <p className={styles.path}>{l.report.dir}</p>
            <p>
              ✓ 通过 {l.report.passed} 笔 · 问题 {l.report.issueCount} 条
            </p>
            <strong>
              ¥ <Money value={l.report.total} />
            </strong>
          </button>
        ))}
      </div>
    </main>
  );
}
