import styles from './labor.module.css';
import uiStyles from '../styles/ui.module.css';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun } from '../store/status.js';
import type { LaborAttachment } from '../../../core/labor/types.js';
import { FileLink } from '../ui.js';
import type { LaborDraft } from './useLaborDraft.js';

export function LaborAttachments({
  dir,
  file,
  attachments,
  model,
}: {
  dir: string;
  file: string;
  attachments: LaborAttachment[];
  model: LaborDraft;
}) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const { draft, setDraft, set } = model;
  return (
    <>
      <div className={styles.laborAttachments}>
        {attachments.map((a) => (
          <div key={a.path}>
            <FileLink file={a.path} />
            <span className={uiStyles.muted + ' ' + uiStyles.small}>{a.label}</span>
          </div>
        ))}
        {!attachments.length && <p className={uiStyles.muted}>未找到附件</p>}
      </div>
      <label>
        发放表金额 <small className={styles.fieldOrigin}>手动</small>
        <input
          aria-label="发放表金额"
          type="number"
          min={0}
          step="any"
          value={draft.tableAmount ?? ''}
          onChange={(e) => {
            if (!e.target.value)
              setDraft((old) => {
                const next = { ...old };
                delete next.tableAmount;
                return next;
              });
            else set('tableAmount', e.target.valueAsNumber);
          }}
        />
      </label>
      <button
        type="button"
        onClick={() =>
          void run(
            async () => await apply(() => window.precheck.saveLabor(dir, file, draft)),
            '发放表金额已保存并重新检查',
          )
        }
      >
        保存发放表金额并重新检查
      </button>
    </>
  );
}
