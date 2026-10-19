import type { Report } from '../../core/types.js';
import { FindingList } from './FindingItem.js';
import type { Run } from './ui.js';

export function Findings({
  report,
  scope,
  run,
  locate,
}: {
  report: Report;
  scope: string;
  run: Run;
  locate?: (group: string) => void;
}) {
  return (
    <section
      aria-label="待处理问题"
      className="actionable-findings"
      data-testid="actionable-findings"
    >
      <h2>待处理问题</h2>
      <FindingList
        scope={scope}
        run={run}
        locate={locate}
        findings={report.findings.map((finding) => ({
          finding,
          group:
            finding.groupId ??
            report.groups.find((g) =>
              g.invoices.some((i) => finding.invoiceNumbers.includes(i.invoice.number)),
            )?.group.id,
        }))}
      />
    </section>
  );
}
