import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type DragEvent,
} from 'react';
import type { Finding } from '../../core/types.js';
import type {
  CorrectionPreview,
  CorrectionTarget,
  ReplacementHistory,
} from '../../core/correction/types.js';
import type { WorkspaceView } from '../../shared/api.js';
import { problemKey } from '../../core/correction/problems.js';
import type { Run } from './ui.js';
import {
  CorrectionModal,
  CorrectionProblems,
  CorrectionNoticeProvider,
  useCorrectionNotice,
  receiptRecord,
} from './CorrectionNotice.js';

interface Request {
  finding?: Finding;
  file?: string;
  source?: string;
  targetId?: string;
  material?: { groupId: string; type: string };
}
const CorrectionContext = createContext<((request?: Request) => void) | null>(null);
interface DialogState {
  source: string;
  targetId: string;
  targets: CorrectionTarget[];
  message: string;
  preview: CorrectionPreview | null;
}
interface ProviderProps {
  dir: string;
  run: Run;
  update: (view: WorkspaceView) => void;
  disabled?: boolean;
  children: ReactNode;
}
export function CorrectionProvider(props: ProviderProps) {
  const notices = useCorrectionNotice();
  return notices ? (
    <CorrectionSession {...props} />
  ) : (
    <CorrectionNoticeProvider run={props.run} update={props.update}>
      <CorrectionSession {...props} />
    </CorrectionNoticeProvider>
  );
}
function CorrectionSession({ dir, run, update, disabled = false, children }: ProviderProps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const token = useRef<string | null>(null);
  const working = useRef(false);
  const notify = useCorrectionNotice()!;
  useEffect(
    () => () => {
      if (token.current) void window.precheck.cancelCorrection(token.current).catch(() => {});
    },
    [],
  );
  const perform = (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    void run(async () => {
      try {
        await action();
      } finally {
        working.current = false;
      }
    });
  };
  const discard = async () => {
    if (token.current) {
      await window.precheck.cancelCorrection(token.current);
      token.current = null;
    }
  };
  const close = async () => {
    await discard();
    setDialog(null);
  };
  const simulate = async (source: string, targetId: string, targets: CorrectionTarget[]) => {
    await discard();
    const preview = await window.precheck.previewCorrection({
      dir,
      source,
      ...(targetId ? { targetId } : {}),
    });
    if (preview.status === 'checked') token.current = preview.token;
    if (preview.status === 'checked' && preview.passed) {
      try {
        const view = await window.precheck.confirmCorrection(preview.token);
        token.current = null;
        update(view);
        setDialog(null);
        notify({ dir, source, preview, record: receiptRecord(view, dir) });
      } catch (error) {
        await discard();
        setDialog({
          source,
          targetId,
          targets,
          message: '',
          preview: {
            ...preview,
            passed: false,
            blockers: [...preview.blockers, error instanceof Error ? error.message : String(error)],
          },
        });
      }
    } else
      setDialog({
        source,
        targetId,
        targets,
        preview,
        message: preview.status === 'needs-target' ? preview.message : '',
      });
  };
  const open = (request: Request = {}) =>
    perform(async () => {
      await discard();
      const targets = await window.precheck.correctionTargets(dir);
      const key = request.finding ? problemKey(request.finding, dir) : undefined;
      const selected =
        request.targetId ??
        targets.find(
          (t) =>
            (key
              ? t.findingKey === key
              : request.material
                ? t.groupId === request.material.groupId &&
                  t.attachmentType === request.material.type
                : false) &&
            (!request.file || t.relativePath === request.file),
        )?.id ??
        '';
      setDialog({ source: '', targetId: selected, targets, message: '', preview: null });
      if (request.source) await simulate(request.source, selected, targets);
    });
  const choose = () =>
    perform(async () => {
      const source = await window.precheck.chooseCorrectionFile();
      if (source && dialog) await simulate(source, dialog.targetId, dialog.targets);
    });
  const drop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files[0];
    if (file && dialog)
      perform(() =>
        simulate(window.precheck.droppedFilePath(file), dialog.targetId, dialog.targets),
      );
  };
  const preview = dialog?.preview?.status === 'checked' ? dialog.preview : null;
  return (
    <CorrectionContext.Provider value={disabled ? null : open}>
      {children}
      {dialog && (
        <CorrectionModal title={preview ? '未通过' : '检查单个文件'} close={() => perform(close)}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={drop}
          >
            {!preview ? (
              <>
                <div className="file-drop-zone">
                  把文件拖到这里
                  <button className="text-button" type="button" onClick={choose}>
                    或从文件夹选择…
                  </button>
                </div>
                {dialog.source && <p className="path">新文件：{dialog.source}</p>}
                <label>
                  要解决哪条问题
                  <select
                    aria-label="要解决哪条问题"
                    value={dialog.targetId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      setDialog({ ...dialog, targetId, preview: null, message: '' });
                      if (dialog.source)
                        perform(() => simulate(dialog.source, targetId, dialog.targets));
                    }}
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
                <p className="write-notice">
                  先在临时副本检查；通过后直接放入原始文件夹。原文件会移到
                  _预检/旧版/，可以撤销。目录内可复用的文件不复制、不改名。
                </p>
              </>
            ) : (
              <>
                <p>{preview.target}</p>
                {preview.blockers.length > 0 && (
                  <ul className="error">
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
            <div className="actions dialog-actions">
              <button type="button" onClick={() => perform(close)}>
                {preview ? '关闭' : '取消'}
              </button>
            </div>
          </div>
        </CorrectionModal>
      )}
    </CorrectionContext.Provider>
  );
}
export function CorrectionAction({
  finding,
  file,
  material,
  global = false,
}: {
  finding?: Finding;
  file?: string;
  material?: Request['material'];
  global?: boolean;
}) {
  const open = useContext(CorrectionContext);
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={() => open({ finding, file, material })}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.dataTransfer.files[0];
        if (item) open({ finding, file, material, source: window.precheck.droppedFilePath(item) });
      }}
      title="也可以把改好的文件拖到这里"
    >
      {global ? '检查单个文件' : '放入改好的文件'}
    </button>
  );
}
export function CorrectionDrop({
  finding,
  file,
  className,
  children,
}: {
  finding: Finding;
  file?: string;
  className?: string;
  children: ReactNode;
}) {
  const open = useContext(CorrectionContext);
  return (
    <div
      className={className}
      onDragOver={(e) => {
        if (open && finding.severity !== 'info') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={(e) => {
        if (!open || finding.severity === 'info') return;
        e.preventDefault();
        e.stopPropagation();
        const item = e.dataTransfer.files[0];
        if (item) open({ finding, file, source: window.precheck.droppedFilePath(item) });
      }}
    >
      {children}
    </div>
  );
}
export function ReplacementRecords({
  history,
  dir,
  run,
  update,
}: {
  history?: ReplacementHistory;
  dir: string;
  run: Run;
  update: (view: WorkspaceView) => void;
}) {
  const records = history?.records ?? [];
  const undone = new Set(records.flatMap((r) => (r.undoOf ? [r.undoOf] : [])));
  const active = records.some((r) => r.kind === 'apply' && !undone.has(r.id));
  return (
    <div className="panel replacement-history" data-testid="replacement-history">
      <div className="card-heading">
        <h3>替换记录</h3>
        {active && (
          <button
            type="button"
            onClick={() =>
              void run(
                async () => update(await window.precheck.undoCorrection(dir)),
                '已撤销最近一次放入，文件已还原',
              )
            }
          >
            撤销最近一次
          </button>
        )}
      </div>
      <p className="small path">_预检/旧版/log.json</p>
      {!records.length ? (
        <p className="muted">尚无放入或撤销记录。</p>
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
              <p className="path">落点：{record.destination}</p>
              <p className="path small">来源：{record.source}</p>
              {record.retained?.map((file) => (
                <p className="path small" key={file.path}>
                  原位保留：{file.path}
                </p>
              ))}
              {record.archived.map((file) => (
                <p className="path small" key={file.path}>
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
