import { useWorkspaceStore } from './store/workspace.js';
import { useStatusStore, useRun } from './store/status.js';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { WorkspaceView } from '../../shared/api.js';
import type {
  CorrectionPreview,
  FileOperation,
  ReplacementRecord,
} from '../../core/correction/types.js';
import type { Finding } from '../../core/types.js';
import { nameOf } from './ui.js';
export type CheckedCorrection = Extract<CorrectionPreview, { status: 'checked' }>;
export interface CorrectionReceipt {
  dir: string;
  source: string;
  preview: CheckedCorrection;
  record?: ReplacementRecord;
}
const Context = createContext<((receipt: CorrectionReceipt) => void) | null>(null);
export const useCorrectionNotice = () => useContext(Context);
export function CorrectionModal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="dialog-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="file-check-dialog"
        data-testid="single-file-dialog"
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
            e.preventDefault();
            close();
          }
          if (e.key === 'Tab') {
            const list = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), select:not(:disabled), [tabindex="0"]',
              ),
            );
            const first = list[0];
            const last = list.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first || document.activeElement === heading.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h2 id={id} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
export function CorrectionProblems({ items }: { items: Finding[] }) {
  return (
    <ul>
      {items
        .filter((f) => f.severity !== 'info')
        .map((f, n) => (
          <li key={n}>
            <span className={'pill ' + f.severity}>
              {f.severity === 'error' ? '✗ 错误' : '! 警告'}
            </span>{' '}
            {f.ruleId} · {f.message}
            <p className="small">怎么处理：{f.action}</p>
            {f.files.length > 0 && <p className="path small">{f.files.map(nameOf).join('、')}</p>}
          </li>
        ))}
    </ul>
  );
}
export function CorrectionOperations({ operations }: { operations: FileOperation[] }) {
  const names = {
    archive: '移入旧版',
    copy: '复制放入',
    retain: '保留目录内文件',
    'confirm-attachment': '确认附件类型（不复制、不改名）',
  };
  return (
    <ul className="operation-list">
      {operations.map((op, i) => (
        <li key={i}>
          {names[op.kind]}：<span className="path">{op.from}</span>
          <br />→ <span className="path">{op.to}</span>
        </li>
      ))}
    </ul>
  );
}
function actualOperations(receipt: CorrectionReceipt): FileOperation[] {
  const { record, preview } = receipt;
  if (!record) return preview.operations;
  return [
    ...preview.operations.filter((o) => o.kind === 'retain' || o.kind === 'confirm-attachment'),
    ...record.archived.map((f) => ({ kind: 'archive' as const, from: f.original, to: f.path })),
    ...record.inserted.map((f) => ({
      kind: 'copy' as const,
      from: f.path === '_预检/manual.json' ? '更新附件/手填索引' : record.source,
      to: f.path,
    })),
  ];
}
export function CorrectionNoticeProvider({ children }: { children: ReactNode }) {
  const run = useRun();
  const busy = useStatusStore((state) => state.busy);
  const apply = useWorkspaceStore((state) => state.apply);
  const [notice, setNotice] = useState<CorrectionReceipt | null>(null);
  const [details, setDetails] = useState<CorrectionReceipt | null>(null);
  const [undoing, setUndoing] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const warnings = notice?.preview.added.filter((f) => f.severity === 'warning').length ?? 0;
  const kinds = new Set(notice?.preview.operations.map((o) => o.kind) ?? []);
  const name = notice ? nameOf(notice.preview.destination ?? notice.source) : '';
  // Files already in the folder are confirmed or kept in place, not copied.
  const action = kinds.has('confirm-attachment')
    ? `已确认〈${name}〉为附件`
    : kinds.has('retain')
      ? `已采用〈${name}〉，旧版已归档`
      : `已放入〈${name}〉`;
  return (
    <Context.Provider value={setNotice}>
      {children}
      {notice && (
        <div role="status" className="correction-toast" data-testid="correction-toast">
          <span>
            {warnings ? `${action}，问题已解决；新增 ${warnings} 条警告` : `${action}，问题已解决`}
          </span>
          <div className="actions">
            <button
              type="button"
              disabled={busy || undoing}
              onClick={() => {
                if (undoing) return;
                setUndoing(true);
                void run(async () => {
                  await apply(() => window.precheck.undoCorrection(notice.dir, notice.record?.id));
                  setNotice(null);
                  setDetails(null);
                }, '已撤销本次放入').finally(() => setUndoing(false));
              }}
            >
              撤销
            </button>
            <button type="button" disabled={busy || undoing} onClick={() => setDetails(notice)}>
              查看详情
            </button>
            <button type="button" aria-label="关闭放入提示" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        </div>
      )}
      {details && (
        <CorrectionModal title="本次放入详情" close={() => setDetails(null)}>
          <p>{details.preview.target}</p>
          <h3>本次新增问题</h3>
          {details.preview.added.some((f) => f.severity !== 'info') ? (
            <CorrectionProblems items={details.preview.added} />
          ) : (
            <p className="muted">无新增错误或警告。</p>
          )}
          <h3>已执行的操作</h3>
          <CorrectionOperations operations={actualOperations(details)} />
          <p className="muted small">原件保存在 _预检/旧版/，可在输出文件的替换记录中撤销。</p>
          <button type="button" onClick={() => setDetails(null)}>
            关闭
          </button>
        </CorrectionModal>
      )}
    </Context.Provider>
  );
}
export function receiptRecord(view: WorkspaceView, dir: string): ReplacementRecord | undefined {
  return (
    view.batches.find((b) => b.batch.dir === dir)?.replacements ??
    view.labor?.find((l) => l.report.dir === dir)?.replacements
  )?.records.at(-1);
}
