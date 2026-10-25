import { useWorkspaceStore } from './store/workspace.js';
import { useRun } from './store/status.js';
import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { relativeProblemFile } from '../../core/correction/problems.js';
import type { Finding } from '../../core/types.js';
import {
  feedbackProblemKey,
  FEEDBACK_TYPES,
  type FeedbackType,
  type FeedbackState,
  type FeedbackPreview,
} from '../../shared/feedback.js';
const relativeDirectory = (root: string | undefined | null, directory: string) =>
  !root || root === directory ? '.' : relativeProblemFile(root, directory);
const Context = createContext<{
  state: FeedbackState;
  reload: () => Promise<void>;
  mark?: (finding: Finding, directory: string) => void;
}>({ state: { records: [], workspaceKey: null }, reload: async () => {} });
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
        <div role="alert" className="message error">
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) {
                setError('请填写备注');
                return;
              }
              setSaving(true);
              void window.precheck
                .markFeedback({
                  directory: target.directory,
                  problemKey: feedbackProblemKey(target.finding, target.directory),
                  type,
                  note,
                })
                .then((value) => {
                  setState(value);
                  setTarget(null);
                })
                .catch((e) => setError(String(e)))
                .finally(() => setSaving(false));
            }}
          >
            <p>
              {target.finding.ruleId} · {target.finding.message}
            </p>
            <fieldset disabled={saving}>
              <legend>反馈类型</legend>
              {Object.entries(FEEDBACK_TYPES).map(([id, label]) => (
                <label className="feedback-choice" key={id}>
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
            <p className="muted small">
              保存在本机；导出反馈包后再发给维护者。同一问题再次反馈会覆盖原记录。
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="actions">
              <button type="submit" className="primary" disabled={saving}>
                保存反馈
              </button>
              <button type="button" disabled={saving} onClick={() => setTarget(null)}>
                取消
              </button>
            </div>
          </form>
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
export function FeedbackDialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const id = useId();
  return createPortal(
    <div
      className="dialog-backdrop"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="file-check-dialog feedback-dialog"
      >
        <div className="page-heading">
          <h2 id={id}>{title}</h2>
          <button type="button" aria-label="关闭对话框" onClick={close}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
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
    <div className="panel feedback-panel">
      <h2>已标记的问题 · {state.records.length} 条</h2>
      <p>反馈保存在本机，不会自动发送。导出当前工作区的标记、解析诊断、设置差异和拒票原因。</p>
      <button
        type="button"
        className="primary"
        disabled={!state.workspaceKey || preparing}
        onClick={() => prepare(false)}
      >
        导出反馈包
      </button>
      {!state.workspaceKey && <p>请先打开工作区。</p>}
      {state.records.map((row) => (
        <article key={row.id} className="feedback-record">
          <strong>
            {row.ruleId} · {FEEDBACK_TYPES[row.type]}
          </strong>
          <p>{row.note}</p>
          <p className="small muted">
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
        <p role="status" className="path">
          已导出：{path}
          <br />
          请把这个文件发给维护者
        </p>
      )}
      {preview && (
        <FeedbackDialog title="导出反馈包预览" close={close}>
          <p>结构化诊断已脱敏。统一社会信用代码、公司、金额和日期保留，便于复现问题。</p>
          <label className="feedback-choice">
            <input
              type="checkbox"
              checked={preview.includeOriginals}
              disabled={preparing}
              onChange={(e) => prepare(e.target.checked)}
            />
            附带原文件（原文件保留原内容，可能含个人信息）
          </label>
          <ul className="feedback-file-list">
            {preview.files.map((f) => (
              <li key={f.path}>
                <span className="path">{f.path}</span>
                <span>{f.size.toLocaleString()} 字节</span>
              </li>
            ))}
          </ul>
          <h3>脱敏样例（仅在本机预览）</h3>
          {preview.samples.length ? (
            preview.samples.map((s, i) => (
              <div className="feedback-sample" key={i}>
                <p>替换前：{s.before}</p>
                <p>替换后：{s.after}</p>
              </div>
            ))
          ) : (
            <p className="muted">当前诊断没有需要替换的样例。</p>
          )}
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={preparing}
              onClick={() =>
                void run(async () => {
                  const file = await window.precheck.exportFeedback(preview.token);
                  if (file) {
                    setPath(file);
                    setPreview(null);
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
      )}
    </div>
  );
}
