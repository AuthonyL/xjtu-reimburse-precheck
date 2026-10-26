import { Collapsible } from './Collapsible.js';
import type { Report } from '../../core/types.js';
import { FindingList } from './FindingItem.js';
import type { Waiver } from '../../core/domain/claim.js';

export function Findings({
  report,
  scope,
  waivers = [],
}: {
  report: Report;
  scope: string;
  waivers?: Waiver[];
}) {
  return (
    <Collapsible
      scope={scope}
      disclosureKey="issues"
      title="待处理问题"
      defaultOpen
      testId="actionable-findings"
      className="actionable-findings"
    >
      <FindingList
        scope={scope}
        findings={report.findings.map((finding) => ({
          finding,
          waiverReason: waivers.find((w) => w.findingId === finding.id)?.reason,
          group:
            finding.groupId ??
            report.groups.find((g) =>
              g.invoices.some((i) => finding.invoiceNumbers.includes(i.invoice.number)),
            )?.group.id,
        }))}
      />
    </Collapsible>
  );
}
