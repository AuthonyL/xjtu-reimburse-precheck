import styles from './correction.module.css';
import uiStyles from '../styles/ui.module.css';
import { TextButton } from '../ui.js';
import type { DragEvent } from 'react';
import type { DialogState } from './context.js';
import { CorrectionModal, CorrectionProblems } from '../CorrectionNotice.js';
import { useStatusStore } from '../store/status.js';
export function SingleFileDialog({
  dialog,
  choose,
  drop,
  close,
  selectTarget,
}: {
  dialog: DialogState;
  choose: () => void;
  drop: (event: DragEvent) => void;
  close: () => void;
  selectTarget: (id: string) => void;
}) {
  const busy = useStatusStore((state) => state.busy);
  const preview = dialog.preview?.status === 'checked' ? dialog.preview : null;
  return (
    <CorrectionModal title={preview ? '未通过' : '检查单个文件'} close={close}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={drop}
      >
        {!preview ? (
          <>
            <div className={styles.fileDropZone}>
              把文件拖到这里
              <TextButton type="button" disabled={busy} onClick={choose}>
                或从文件夹选择…
              </TextButton>
            </div>
            {dialog.source && <p className={uiStyles.path}>新文件：{dialog.source}</p>}
            <label>
              要解决哪条问题
              <select
                disabled={busy}
                aria-label="要解决哪条问题"
                value={dialog.targetId}
                onChange={(e) => selectTarget(e.target.value)}
              >
                <option value="">自动判断</option>
                {dialog.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {dialog.message && <p role="alert">{dialog.message}</p>}
            <p className={styles.writeNotice}>
              先在临时副本检查；通过后直接放入原始文件夹。原文件会移到
              _预检/旧版/，可以撤销。目录内可复用的文件不复制、不改名。
            </p>
          </>
        ) : (
          <>
            <p>{preview.target}</p>
            {preview.blockers.length > 0 && (
              <ul className={'error'}>
                {preview.blockers.map((b, n) => (
                  <li key={n}>{b}</li>
                ))}
              </ul>
            )}
            {!preview.resolved && (
              <>
                <h3>目标问题仍存在</h3>
                {preview.targetRemaining?.length ? (
                  <CorrectionProblems items={preview.targetRemaining} />
                ) : (
                  <p>这条问题还没有解决，请继续修改后再试。</p>
                )}
              </>
            )}
            {preview.added.some((f) => f.severity !== 'info') && (
              <>
                <h3>新文件带来的问题</h3>
                <CorrectionProblems items={preview.added} />
              </>
            )}
          </>
        )}
        <div className={uiStyles.actions + ' ' + styles.dialogActions}>
          <button type="button" disabled={busy} onClick={close}>
            {preview ? '关闭' : '取消'}
          </button>
        </div>
      </div>
    </CorrectionModal>
  );
}
