import styles from './claim.module.css';
import uiStyles from '../styles/ui.module.css';
import { useContext } from 'react';
import { DropdownMenu } from 'radix-ui';
import { PageHeader, TextButton } from '../ui.js';
import { useRun } from '../store/status.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRouteStore } from '../store/route.js';
import type { Claim } from '../../../core/domain/claim.js';
import type { WorkspaceView } from '../../../shared/api.js';
import { CorrectionContext } from '../correction/context.js';
import { ClaimStatus } from './ClaimStatus.js';
import { ClaimMeta } from './ClaimMeta.js';
import { ClaimHistory } from './ClaimHistory.js';

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
  const correct = useContext(CorrectionContext);
  const back = () => useRouteStore.getState().select('');
  const apply = useWorkspaceStore((state) => state.apply);
  const mutate = (fn: () => Promise<WorkspaceView>, notice?: string) =>
    void run(() => apply(fn), notice);
  return (
    <>
      <PageHeader
        title={id}
        className={styles.resultsToolbar}
        leading={<TextButton onClick={back}>← 批次总览</TextButton>}
        badge={<ClaimStatus key={dir} claim={claim} dir={dir} readOnly={readOnly} />}
        actions={
          !readOnly && (
            <div className={uiStyles.actions + ' ' + styles.toolbarActions}>
              <button
                className={uiStyles.primary}
                onClick={() =>
                  mutate(() => window.precheck.exportBatch(dir), '导出完成，可在下方打开文件')
                }
              >
                导出到批次文件夹
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button">
                    更多 <span aria-hidden="true">▾</span>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className={uiStyles.menu} align="end" sideOffset={4}>
                    {correct && (
                      <DropdownMenu.Item className={uiStyles.menuItem} onSelect={() => correct({})}>
                        检查单个文件
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item
                      className={uiStyles.menuItem}
                      onSelect={() => mutate(() => window.precheck.recheck(dir))}
                    >
                      重新检查
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={uiStyles.menuItem}
                      onSelect={() => void run(() => window.precheck.openOutput(dir))}
                    >
                      打开输出文件夹
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          )
        }
      />
      <ClaimMeta key={dir} claim={claim} dir={dir} readOnly={readOnly} />
      <ClaimHistory claim={claim} dir={dir} />
    </>
  );
}
