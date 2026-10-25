import type { CheckResult } from '../src/core/types.js';

export function normalized(result: CheckResult) {
  const sort = <T>(items: T[]) =>
    [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    ...result,
    findings: sort(result.findings),
    groups: result.groups.map((group) => ({ ...group, requirements: sort(group.requirements) })),
  };
}
