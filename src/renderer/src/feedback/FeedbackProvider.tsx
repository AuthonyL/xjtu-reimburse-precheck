import styles from '../styles/shell.module.css';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { useWorkspaceStore } from '../store/workspace.js';
import type { Finding } from '../../../core/types.js';
import {
  feedbackProblemKey,
  type FeedbackType,
  type FeedbackState,
} from '../../../shared/feedback.js';
import { Context, relativeDirectory } from './context.js';
import { FeedbackDialog } from './FeedbackDialog.js';
import { FeedbackForm } from './FeedbackForm.js';
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const revision = useWorkspaceStore((state) => state.view);
  const [state, setState] = useState<FeedbackState>({ records: [], workspaceKey: null });
  const [target, setTarget] = useState<{ finding: Finding; directory: string } | null>(null);
  const [type, setType] = useState<FeedbackType>('falsePositive');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const reload = async () => {
    if (window.precheck.feedbackState) setState(await window.precheck.feedbackState());
  };
  useEffect(() => {
    let alive = true;
    if (window.precheck.feedbackState)
      void window.precheck
        .feedbackState()
        .then((s) => {
          if (alive) setState(s);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    return () => {
      alive = false;
    };
  }, [revision]);
  const mark = (finding: Finding, directory: string) => {
    const old = state.records.find(
      (r) =>
        r.workspaceKey === state.workspaceKey &&
        r.problemKey === feedbackProblemKey(finding, directory) &&
        r.directory === relativeDirectory(state.workspaceDir, directory),
    );
    setTarget({ finding, directory });
    setType(old?.type ?? 'falsePositive');
    setNote(old?.note ?? '');
    setError('');
  };
  return (
    <Context.Provider value={{ state, reload, mark }}>
      {children}
      {!target && error && (
        <div role="alert" className={styles.message + ' ' + 'error'}>
          反馈记录读取失败：{error}
          <button type="button" onClick={() => setError('')}>
            关闭
          </button>
        </div>
      )}
      {target && (
        <FeedbackDialog
          title="这条不对"
          close={() => {
            if (!saving) setTarget(null);
          }}
        >
          <FeedbackForm
            finding={target.finding}
            directory={target.directory}
            initialType={type}
            initialNote={note}
            error={error}
            setError={setError}
            save={(value) => {
              setState(value);
              setTarget(null);
            }}
            cancel={() => setTarget(null)}
            onSavingChange={setSaving}
          />
        </FeedbackDialog>
      )}
    </Context.Provider>
  );
}
export function useFindingFeedback(finding: Finding, directory: string) {
  const { state, mark } = useContext(Context);
  const key = feedbackProblemKey(finding, directory);
  return {
    marked: state.records.some(
      (r) =>
        r.workspaceKey === state.workspaceKey &&
        r.problemKey === key &&
        r.directory === relativeDirectory(state.workspaceDir, directory),
    ),
    mark: mark ? () => mark(finding, directory) : undefined,
  };
}
