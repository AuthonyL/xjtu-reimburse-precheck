import styles from './correction.module.css';
import uiStyles from '../styles/ui.module.css';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useWorkspaceStore } from '../store/workspace.js';
import { useStatusStore, useRun } from '../store/status.js';
import type { FileOperation } from '../../../core/correction/types.js';
import type { CorrectionReceipt } from './receipt.js';
import { nameOf } from '../ui.js';
import { CorrectionModal } from './CorrectionModal.js';
import { CorrectionProblems, CorrectionOperations } from './CorrectionProblems.js';
const Context = createContext<((receipt: CorrectionReceipt) => void) | null>(null);
export const useCorrectionNotice = () => useContext(Context);
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
        <div role="status" className={styles.correctionToast} data-testid="correction-toast">
          <span>
            {warnings ? `${action}，问题已解决；新增 ${warnings} 条警告` : `${action}，问题已解决`}
          </span>
          <div className={uiStyles.actions + ' ' + styles.noticeActions}>
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
            <p className={uiStyles.muted}>无新增错误或警告。</p>
          )}
          <h3>已执行的操作</h3>
          <CorrectionOperations operations={actualOperations(details)} />
          <p className={uiStyles.muted + ' ' + uiStyles.small}>
            原件保存在 _预检/旧版/，可在输出文件的替换记录中撤销。
          </p>
          <button type="button" onClick={() => setDetails(null)}>
            关闭
          </button>
        </CorrectionModal>
      )}
    </Context.Provider>
  );
}
