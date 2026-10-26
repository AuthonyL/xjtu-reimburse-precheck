import { useId, useState, type Ref } from 'react';
import styles from '../styles/forms.module.css';
import uiStyles from '../styles/ui.module.css';

export function ClaimReasonForm({
  label,
  title,
  save,
  cancel,
  submit,
  textareaRef,
}: {
  label: string;
  title: string;
  save: string;
  cancel: () => void;
  submit: (reason: string) => Promise<void>;
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <form
      className={styles.manualForm}
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim() || saving) return;
        setSaving(true);
        void submit(reason.trim()).finally(() => setSaving(false));
      }}
    >
      <strong>{title}</strong>
      <label htmlFor={id}>
        {label}（必填）
        <textarea
          ref={textareaRef}
          id={id}
          aria-label={label}
          required
          autoFocus
          rows={3}
          maxLength={4000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className={uiStyles.actions}>
        <button type="submit" className={uiStyles.primary} disabled={!reason.trim() || saving}>
          {save}
        </button>
        <button type="button" disabled={saving} onClick={cancel}>
          取消
        </button>
      </div>
    </form>
  );
}
