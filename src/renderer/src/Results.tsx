import styles from './claim/claim.module.css';
import type { BatchView, AppSettings } from '../../shared/api.js';
import { RuleHelpProvider } from './RuleHelp.js';
import { CorrectionProvider } from './SingleFileCheck.js';
import { Findings } from './Findings.js';
import { ClaimHeader } from './claim/ClaimHeader.js';
import { ClaimSummary } from './claim/ClaimSummary.js';
import { RequirementChecklist } from './claim/RequirementChecklist.js';
import { InvoiceTable } from './claim/InvoiceTable.js';
import { ManualPanel } from './claim/ManualPanel.js';
import { OutputsPanel } from './claim/OutputsPanel.js';

export function Results({
  view,
  settings,
  highlight,
}: {
  view: BatchView;
  settings?: AppSettings;
  highlight?: string;
}) {
  const { batch, report, claim, readOnly } = view;
  const pending = view.manualTasks.filter((task) => task.pending).length;
  return (
    <RuleHelpProvider rules={settings?.rules}>
      <CorrectionProvider dir={batch.dir} disabled={!!readOnly}>
        <main className={styles.results}>
          <ClaimHeader id={batch.id} dir={batch.dir} claim={claim} readOnly={readOnly} />
          <ClaimSummary
            report={report}
            pending={pending}
            submitted={batch.submitted}
            state={claim.state}
            dir={batch.dir}
          />
          <Findings scope={batch.dir} report={report} waivers={claim.waivers} />
          <RequirementChecklist
            groups={report.groups}
            counts={report.requirementCounts}
            dir={batch.dir}
            readOnly={readOnly}
            highlight={highlight}
          />
          <InvoiceTable
            groups={report.groups}
            entries={batch.manual.entries}
            dir={batch.dir}
            totalCny={report.totalCny}
          />
          {!readOnly && (
            <ManualPanel
              tasks={view.manualTasks}
              dir={batch.dir}
              exchangeRateType={settings?.rules.exchangeRateType}
            />
          )}
          <OutputsPanel
            outputs={view.outputs}
            history={view.replacements}
            dir={batch.dir}
            readOnly={readOnly}
          />
        </main>
      </CorrectionProvider>
    </RuleHelpProvider>
  );
}
