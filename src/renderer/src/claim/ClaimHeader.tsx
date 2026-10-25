import styles from './claim.module.css';
import uiStyles from '../styles/ui.module.css';
import { TextButton } from '../ui.js';
import { useRun } from '../store/status.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRouteStore } from '../store/route.js';
import type { Claim } from '../../../core/domain/claim.js';
import type { WorkspaceView } from '../../../shared/api.js';
import { CorrectionAction } from '../SingleFileCheck.js';
import { ClaimStatus } from './ClaimStatus.js';

export function ClaimHeader({
  id,
  dir,
  claim,
  readOnly,
}: {
  id: string;
  dir: string;
  claim: Claim;
  readOnly?: boolean;
}) {
  const run = useRun();
  const back = () => useRouteStore.getState().select('');
  const apply = useWorkspaceStore((state) => state.apply);
  const mutate = (fn: () => Promise<WorkspaceView>, notice?: string) =>
    void run(() => apply(fn), notice);
  return (
    <div className={styles.resultsToolbar}>
      <TextButton onClick={back}>← 批次总览</TextButton>
      <strong>{id}</strong>
      <ClaimStatus key={dir} claim={claim} dir={dir} readOnly={readOnly} />
      {!readOnly && (
        <div className={uiStyles.actions + ' ' + styles.toolbarActions}>
          <CorrectionAction global />
          <button onClick={() => mutate(() => window.precheck.recheck(dir))}>重新检查</button>
          <button
            className={uiStyles.primary}
            onClick={() =>
              mutate(() => window.precheck.exportBatch(dir), '导出完成，可在下方打开文件')
            }
          >
            导出到批次文件夹
          </button>
          <button onClick={() => void run(() => window.precheck.openOutput(dir))}>
            打开输出文件夹
          </button>
        </div>
      )}
    </div>
  );
}
