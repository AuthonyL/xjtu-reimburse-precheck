import styles from '../styles/ui.module.css';
import feedbackFeedbackStyles from './feedback.module.css';
import { useContext, useState } from 'react';
import { useRun } from '../store/status.js';
import { FEEDBACK_TYPES, type FeedbackPreview } from '../../../shared/feedback.js';
import { Context } from './context.js';
import { FeedbackPreviewDialog } from './FeedbackPreviewDialog.js';
export function FeedbackPanel() {
  const run = useRun();
  const { state, reload } = useContext(Context);
  const [preview, setPreview] = useState<FeedbackPreview | null>(null);
  const [path, setPath] = useState('');
  const [preparing, setPreparing] = useState(false);
  const prepare = (originals: boolean) => {
    setPreparing(true);
    void run(async () => setPreview(await window.precheck.previewFeedback(originals))).finally(() =>
      setPreparing(false),
    );
  };
  const close = () => {
    if (preparing) return;
    setPreview(null);
    void window.precheck.cancelFeedback();
  };
  return (
    <div className={styles.panel + ' ' + feedbackFeedbackStyles.feedbackPanel}>
      <h2>已标记的问题 · {state.records.length} 条</h2>
      <p>反馈保存在本机，不会自动发送。导出当前工作区的标记、解析诊断、设置差异和拒票原因。</p>
      <button
        type="button"
        className={styles.primary}
        disabled={!state.workspaceKey || preparing}
        onClick={() => prepare(false)}
      >
        导出反馈包
      </button>
      {!state.workspaceKey && <p>请先打开工作区。</p>}
      {state.records.map((row) => (
        <article key={row.id} className={feedbackFeedbackStyles.feedbackRecord}>
          <strong>
            {row.ruleId} · {FEEDBACK_TYPES[row.type]}
          </strong>
          <p>{row.note}</p>
          <p className={styles.small + ' ' + styles.muted}>
            {row.workspaceName}/{row.directory} · {row.recordedAt.slice(0, 10)}
          </p>
          <p>{row.message}</p>
          <button
            type="button"
            onClick={() =>
              void run(async () => {
                await window.precheck.deleteFeedback(row.id);
                await reload();
              })
            }
          >
            删除标记
          </button>
        </article>
      ))}
      {path && (
        <p role="status" className={styles.path}>
          已导出：{path}
          <br />
          请把这个文件发给维护者
        </p>
      )}
      {preview && (
        <FeedbackPreviewDialog
          preview={preview}
          preparing={preparing}
          prepare={prepare}
          close={close}
          exported={(file) => {
            setPath(file);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
