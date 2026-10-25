import type {
  CheckResult,
  Finding,
  Report,
  Requirement,
  RequirementCounts,
  Severity,
} from './types.js';
import { roundMoney } from './parse/common.js';

export function countSeverities(findings: readonly Finding[]): Record<Severity, number> {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

export function countRequirements(requirements: Requirement[]): RequirementCounts {
  return {
    total: requirements.length,
    found: requirements.filter((r) => r.status === 'found').length,
    unconfirmed: requirements.filter((r) => r.status === 'unconfirmed').length,
    missing: requirements.filter((r) => r.status === 'missing').length,
  };
}

export function buildReport(result: CheckResult): Report {
  const groups = result.groups.map((g) => ({
    ...g,
    totalCny: roundMoney(g.invoices.reduce((s, i) => s + (i.cnyAmount ?? 0), 0)),
    unconverted: g.invoices.filter((i) => i.cnyAmount === null),
    requirementCounts: countRequirements(g.requirements),
  }));
  const active = groups.filter((g) => !g.group.flags.deferred);
  const totals = new Map<string, number>();
  for (const group of active)
    for (const item of group.invoices)
      if (item.cnyAmount !== null)
        totals.set(
          item.expenseContent,
          roundMoney((totals.get(item.expenseContent) ?? 0) + item.cnyAmount),
        );
  const rank = { error: 0, warning: 1, info: 2 };
  return {
    batchId: result.batch.id,
    groups,
    findings: [...result.findings].sort((a, b) => rank[a.severity] - rank[b.severity]),
    totals: [...totals].map(([expenseContent, amount]) => ({ expenseContent, amount })),
    totalCny: roundMoney([...totals.values()].reduce((a, b) => a + b, 0)),
    invoiceCount: result.batch.invoices.length,
    unconverted: active.flatMap((g) => g.unconverted),
    incompleteGroups: active
      .filter(
        (g) =>
          (g.group.flags.ai && !g.invoices.length) ||
          result.findings.some(
            (f) =>
              f.groupId === g.group.id &&
              f.ruleId === 'R3' &&
              !f.invoiceNumbers.length &&
              f.code === 'manual-amount',
          ),
      )
      .map((g) => g.group.id),
    deferredGroups: groups.filter((g) => g.group.flags.deferred),
    requirementCounts: countRequirements(groups.flatMap((g) => g.requirements)),
  };
}
