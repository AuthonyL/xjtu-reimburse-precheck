import styles from './feedback.module.css';
import uiStyles from '../styles/ui.module.css';
import { useRun } from '../store/status.js';
import type { FeedbackPreview } from '../../../shared/feedback.js';
import { FeedbackDialog } from './FeedbackDialog.js';
export function FeedbackPreviewDialog({
  preview,
  preparing,
  prepare,
  close,
  exported,
}: {
  preview: FeedbackPreview;
  preparing: boolean;
  prepare: (originals: boolean) => void;
  close: () => void;
  exported: (file: string) => void;
}) {
  const run = useRun();
  return (
    <FeedbackDialog title="导出反馈包预览" close={close}>
      <p>结构化诊断已脱敏。统一社会信用代码、公司、金额和日期保留，便于复现问题。</p>
      <label className={styles.feedbackChoice}>
        <input
          type="checkbox"
          checked={preview.includeOriginals}
          disabled={preparing}
          onChange={(e) => prepare(e.target.checked)}
        />
        附带原文件（原文件保留原内容，可能含个人信息）
      </label>
      <ul className={styles.feedbackFileList}>
        {preview.files.map((f) => (
          <li key={f.path}>
            <span className={uiStyles.path}>{f.path}</span>
            <span>{f.size.toLocaleString()} 字节</span>
          </li>
        ))}
      </ul>
      <h3>脱敏样例（仅在本机预览）</h3>
      {preview.samples.length ? (
        preview.samples.map((s, i) => (
          <div className={styles.feedbackSample} key={i}>
            <p>替换前：{s.before}</p>
            <p>替换后：{s.after}</p>
          </div>
        ))
      ) : (
        <p className={uiStyles.muted}>当前诊断没有需要替换的样例。</p>
      )}
      <div className={uiStyles.actions}>
        <button
          type="button"
          className={uiStyles.primary}
          disabled={preparing}
          onClick={() =>
            void run(async () => {
              const file = await window.precheck.exportFeedback(preview.token);
              if (file) {
                exported(file);
              }
            })
          }
        >
          确认导出
        </button>
        <button type="button" onClick={close}>
          取消
        </button>
      </div>
    </FeedbackDialog>
  );
}
