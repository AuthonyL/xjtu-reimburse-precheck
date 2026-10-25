import styles from './feedback.module.css';
import uiStyles from '../styles/ui.module.css';
import { useState } from 'react';
import type { Finding } from '../../../core/types.js';
import {
  feedbackProblemKey,
  FEEDBACK_TYPES,
  type FeedbackType,
  type FeedbackState,
} from '../../../shared/feedback.js';
export function FeedbackForm({
  finding,
  directory,
  initialType,
  initialNote,
  error,
  setError,
  save,
  cancel,
  onSavingChange,
}: {
  finding: Finding;
  directory: string;
  initialType: FeedbackType;
  initialNote: string;
  error: string;
  setError: (error: string) => void;
  save: (state: FeedbackState) => void;
  cancel: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [type, setType] = useState(initialType);
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!note.trim()) {
          setError('请填写备注');
          return;
        }
        setSaving(true);
        onSavingChange(true);
        void window.precheck
          .markFeedback({
            directory: directory,
            problemKey: feedbackProblemKey(finding, directory),
            type,
            note,
          })
          .then((value) => {
            save(value);
          })
          .catch((e) => setError(String(e)))
          .finally(() => {
            setSaving(false);
            onSavingChange(false);
          });
      }}
    >
      <p>
        {finding.ruleId} · {finding.message}
      </p>
      <fieldset disabled={saving}>
        <legend>反馈类型</legend>
        {Object.entries(FEEDBACK_TYPES).map(([id, label]) => (
          <label className={styles.feedbackChoice} key={id}>
            <input
              type="radio"
              name="feedback-type"
              value={id}
              checked={type === id}
              onChange={() => setType(id as FeedbackType)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        备注（必填）
        <textarea
          aria-label="反馈备注"
          autoFocus
          required
          maxLength={4000}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className={uiStyles.muted + ' ' + uiStyles.small}>
        保存在本机；导出反馈包后再发给维护者。同一问题再次反馈会覆盖原记录。
      </p>
      {error && <p role="alert">{error}</p>}
      <div className={uiStyles.actions}>
        <button type="submit" className={uiStyles.primary} disabled={saving}>
          保存反馈
        </button>
        <button type="button" disabled={saving} onClick={cancel}>
          取消
        </button>
      </div>
    </form>
  );
}
