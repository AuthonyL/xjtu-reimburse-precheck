import styles from './claim.module.css';
import uiStyles from '../styles/ui.module.css';
import type { Requirement } from '../../../core/types.js';
import type { WorkspaceView } from '../../../shared/api.js';
import { useRun } from '../store/status.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { FileLink, materialNames } from '../ui.js';
import { CorrectionAction } from '../SingleFileCheck.js';

export function RequirementRow({
  requirement,
  groupId,
  dir,
  readOnly,
}: {
  requirement: Requirement;
  groupId: string;
  dir: string;
  readOnly?: boolean;
}) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const mutate = (fn: () => Promise<WorkspaceView>, notice?: string) =>
    void run(() => apply(fn), notice);
  return (
    <div className={styles.requirement} data-testid={'requirement-' + requirement.type}>
      <div className={styles.requirementStatus + ' ' + requirement.status}>
        {{ found: '✓ 已找到', unconfirmed: '? 待确认', missing: '✗ 缺失' }[requirement.status]}
      </div>
      <div className={styles.requirementContent}>
        <strong>{materialNames[requirement.type]}</strong>
        <span className={uiStyles.ruleTag}>{requirement.ruleIds.join(' / ')}</span>
        <p>{requirement.reason}</p>
        {requirement.status !== 'found' && !readOnly && (
          <CorrectionAction material={{ groupId: groupId, type: requirement.type }} />
        )}
        {requirement.note && (
          <p className={uiStyles.muted + ' ' + uiStyles.small}>{requirement.note}</p>
        )}
        {requirement.foundFiles.map((f) => (
          <FileLink key={f.path} file={f.path} />
        ))}
        {requirement.candidateFiles.map((f) => (
          <div className={styles.candidate} key={f.path}>
            <FileLink file={f.path} />
            {!readOnly && (
              <button
                onClick={() =>
                  mutate(
                    () => window.precheck.confirmAttachment(dir, f.relativePath, requirement.type),
                    '附件类型已确认',
                  )
                }
              >
                是{materialNames[requirement.type]}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
