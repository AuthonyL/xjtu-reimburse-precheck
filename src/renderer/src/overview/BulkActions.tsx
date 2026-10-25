import type { BatchView } from '../../../shared/api.js';
import { availableTransitions } from '../../../core/domain/transitions.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun, useStatusStore } from '../store/status.js';
import styles from './overview.module.css';

export function BulkActions({ selected }: { selected: BatchView[] }) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const busy = useStatusStore((state) => state.busy);
  const allowed = selected.filter((row) => availableTransitions(row.claim.state).includes('ready'));
  const perform = (rows: BatchView[], action: 'export' | 'ready') => {
    const verb = action === 'export' ? '已导出' : '已标记为待提交';
    void run(async () => {
      let done = 0;
      try {
        for (const row of rows) {
          await apply(() =>
            action === 'export'
              ? window.precheck.exportBatch(row.batch.dir)
              : window.precheck.transitionClaim(row.batch.dir, 'ready'),
          );
          done++;
        }
      } catch (error) {
        throw new Error(
          `${verb} ${done} 个批次；${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, `${verb} ${rows.length} 个批次`);
  };
  return (
    <div className={styles.bulk} role="toolbar" aria-label="批量操作">
      <strong>已选 {selected.length} 个批次</strong>
      <button disabled={busy} onClick={() => perform(selected, 'export')}>
        批量导出汇总
      </button>
      <button disabled={busy || !allowed.length} onClick={() => perform(allowed, 'ready')}>
        标记为待提交
      </button>
      {allowed.length < selected.length && (
        <span>将跳过 {selected.length - allowed.length} 个不允许的批次</span>
      )}
    </div>
  );
}
