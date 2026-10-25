import styles from '../styles/ui.module.css';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun } from '../store/status.js';
import type { LaborManualEntry } from '../../../core/labor/types.js';

export function LaborTemplate({
  dir,
  file,
  preview,
  draft,
}: {
  dir: string;
  file: string;
  preview: string;
  draft: LaborManualEntry;
}) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  return (
    <>
      <label>
        规范情况说明预览
        <textarea aria-label="规范情况说明预览" rows={5} readOnly value={preview} />
      </label>
      <p className={styles.small + ' ' + styles.muted}>
        请检查【待补充】字段、日期和事由后使用。导出会保存当前手填，且同名输出会覆盖。
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => void run(() => window.precheck.copyText(preview), '情况说明已复制')}
        >
          复制文本
        </button>
        <button
          type="button"
          onClick={() =>
            void run(
              async () => await apply(() => window.precheck.exportLabor(dir, file, draft)),
              'Word 已导出到劳务目录的 _预检/',
            )
          }
        >
          导出 Word
        </button>
      </div>
    </>
  );
}
