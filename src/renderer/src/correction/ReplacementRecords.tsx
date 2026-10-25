import styles from '../styles/ui.module.css';
import correctionCorrectionStyles from './correction.module.css';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun } from '../store/status.js';
import type { ReplacementHistory } from '../../../core/correction/types.js';
export function ReplacementRecords({
  history,
  dir,
}: {
  history?: ReplacementHistory;
  dir: string;
}) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const records = history?.records ?? [];
  const undone = new Set(records.flatMap((r) => (r.undoOf ? [r.undoOf] : [])));
  const active = records.some((r) => r.kind === 'apply' && !undone.has(r.id));
  return (
    <div
      className={styles.panel + ' ' + correctionCorrectionStyles.replacementHistory}
      data-testid="replacement-history"
    >
      <div className={styles.cardHeading}>
        <h3>替换记录</h3>
        {active && (
          <button
            type="button"
            onClick={() =>
              void run(
                () => apply(() => window.precheck.undoCorrection(dir)),
                '已撤销最近一次放入，文件已还原',
              )
            }
          >
            撤销最近一次
          </button>
        )}
      </div>
      <p className={styles.small + ' ' + styles.path}>_预检/旧版/log.json</p>
      {!records.length ? (
        <p className={styles.muted}>尚无放入或撤销记录。</p>
      ) : (
        <ol>
          {[...records].reverse().map((record) => (
            <li key={record.id}>
              <strong>
                {record.kind === 'undo'
                  ? '撤销'
                  : record.operation === 'confirm-attachment'
                    ? '确认附件'
                    : '放入'}{' '}
                · {new Date(record.at).toLocaleString('zh-CN')}
              </strong>
              <p>{record.target}</p>
              <p className={styles.path}>落点：{record.destination}</p>
              <p className={styles.path + ' ' + styles.small}>来源：{record.source}</p>
              {record.retained?.map((file) => (
                <p className={styles.path + ' ' + styles.small} key={file.path}>
                  原位保留：{file.path}
                </p>
              ))}
              {record.archived.map((file) => (
                <p className={styles.path + ' ' + styles.small} key={file.path}>
                  旧版：{file.path}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
