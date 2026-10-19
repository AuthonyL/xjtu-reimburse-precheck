import { compareBatches } from '../../core/batch-order.js';
import type { WorkspaceView } from '../../shared/api.js';
import { Counts, money, nameOf } from './ui.js';

export function Overview({
  view,
  select,
  refresh,
}: {
  view: WorkspaceView;
  select: (dir: string) => void;
  refresh: () => void;
}) {
  return (
    <main>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{view.kind === 'root' ? '根目录' : '工作区'}</div>
          <h1>{nameOf(view.dir)}</h1>
          <p className="path">{view.dir}</p>
        </div>
        <button onClick={refresh}>全部重新检查</button>
      </div>
      <div className="batch-grid">
        {[...view.batches]
          .sort((a, b) => compareBatches(a.batch, b.batch))
          .map((b) => (
            <button key={b.batch.dir} className="batch-card" onClick={() => select(b.batch.dir)}>
              <div className="card-heading">
                <h2>{b.batch.id}</h2>
                <span>{b.report.invoiceCount} 张</span>
              </div>
              <Counts report={b.report} />
              <p>
                {b.batch.submitted ? '✓ 已有学校报销单' : '未找到学校报销单'}
                {b.markedAt ? ' · ✓ APP 已标记提交' : ''}
              </p>
              {b.report.totals.map((t) => (
                <div className="total-row" key={t.expenseContent}>
                  <span>{t.expenseContent}</span>
                  <strong>¥ {money(t.amount)}</strong>
                </div>
              ))}
              {!!b.report.unconverted.length && (
                <p className="muted">另有 {b.report.unconverted.length} 张未折算</p>
              )}
            </button>
          ))}
        {view.labor?.map((l) => (
          <button className="batch-card" key={l.report.dir} onClick={() => select(l.report.dir)}>
            <div className="card-heading">
              <h2>{l.report.name}</h2>
              <span>
                {l.report.payoutCount} 笔（{l.report.entries.length} 份说明）
              </span>
            </div>
            <p className="path">{l.report.dir}</p>
            <p>
              ✓ 通过 {l.report.passed} 笔 · 问题 {l.report.issueCount} 条
            </p>
            <strong>¥ {money(l.report.total)}</strong>
          </button>
        ))}
      </div>
    </main>
  );
}
