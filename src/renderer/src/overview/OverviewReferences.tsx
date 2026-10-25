import type { WorkspaceView } from '../../../shared/api.js';
import { Money } from '../ui.js';
import { useRouteStore } from '../store/route.js';
import styles from './overview.module.css';

export function OverviewReferences({ view }: { view: WorkspaceView }) {
  const select = useRouteStore((state) => state.select);
  if (!view.labor?.length && !view.rejected) return null;
  return (
    <section aria-label="其他目录">
      <h2>其他目录</h2>
      <div className={styles.references}>
        {view.labor?.map(({ report }) => (
          <button key={report.dir} onClick={() => select(report.dir)}>
            <strong>{report.name}</strong>
            <span>
              {report.payoutCount} 笔 · {report.entries.length} 份说明 · 通过 {report.passed} 笔 ·
              问题 {report.issueCount} 条
            </span>
            <span>
              ¥ <Money value={report.total} />
            </span>
          </button>
        ))}
        {view.rejected && (
          <button aria-label="无法报销费用" onClick={() => select(view.rejected!.batch.dir)}>
            <strong>无法报销费用</strong>
            <span>只读参考 · {view.rejected.report.invoiceCount} 张</span>
          </button>
        )}
      </div>
    </section>
  );
}
