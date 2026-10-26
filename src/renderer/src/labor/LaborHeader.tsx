import styles from '../styles/ui.module.css';
import laborLaborStyles from './labor.module.css';
import { Money, PageHeader } from '../ui.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun } from '../store/status.js';
import type { LaborReport } from '../../../core/labor/types.js';
import { CorrectionAction } from '../SingleFileCheck.js';

export function LaborHeader({ report }: { report: LaborReport }) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  return (
    <>
      <PageHeader
        title={report.name}
        subtitle={<span className={styles.path}>{report.dir}</span>}
        actions={
          <>
            <CorrectionAction global />
            <button
              onClick={() => void run(() => apply(() => window.precheck.recheck(report.dir)))}
            >
              重新检查
            </button>
          </>
        }
      />
      <div className={laborLaborStyles.compactSummary} data-testid="labor-summary">
        <strong>
          合计 ¥ <Money value={report.total} />
        </strong>
        <span>
          {report.payoutCount} 笔（{report.entries.length} 份说明）
        </span>
        <span>通过 {report.passed} 笔</span>
        <span>问题 {report.issueCount} 条</span>
      </div>
    </>
  );
}
