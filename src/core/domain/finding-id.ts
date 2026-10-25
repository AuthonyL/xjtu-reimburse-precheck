import type { Finding, Requirement } from '../types.js';
export interface ProblemAliases {
  files?: Record<string, string>;
  invoiceNumbers?: Record<string, string>;
}
const slash = (value: string) => value.replaceAll('\\', '/');
export function relativeProblemFile(base: string, file: string): string {
  const b = slash(base).replace(/\/$/, '');
  const f = slash(file);
  return f.startsWith(b + '/') ? f.slice(b.length + 1) : f;
}
export function findingId(
  finding: Omit<Finding, 'id' | 'ruleIds'>,
  baseDir: string,
  aliases: ProblemAliases = {},
): string {
  const ids = [...new Set(finding.ruleId.split('/'))].sort();
  const numbers = [
    ...new Set(finding.invoiceNumbers.map((n) => aliases.invoiceNumbers?.[n] ?? n)),
  ].sort();
  const files = [
    ...new Set(
      finding.files.map((f) => relativeProblemFile(baseDir, f)).map((f) => aliases.files?.[f] ?? f),
    ),
  ].sort();
  return JSON.stringify({
    rules: ids,
    anchor: numbers.length
      ? { numbers }
      : files.length
        ? { files }
        : { group: finding.groupId ?? '根目录' },
    code: finding.code ?? (finding.requirementType ? 'attachment:' + finding.requirementType : ''),
    ...(finding.requirementType ? { group: finding.groupId ?? '根目录' } : {}),
  });
}

export function withFindingId(finding: Omit<Finding, 'id' | 'ruleIds'>, baseDir: string): Finding {
  return {
    ...finding,
    id: findingId(finding, baseDir),
    ruleIds: [...new Set(finding.ruleId.split('/'))].sort(),
  };
}

export function requirementId(
  requirement: Pick<Requirement, 'type' | 'ruleIds' | 'invoiceNumbers'>,
  groupId: string,
): string {
  return JSON.stringify({
    type: requirement.type,
    rules: [...new Set(requirement.ruleIds)].sort(),
    numbers: [...new Set(requirement.invoiceNumbers)].sort(),
    group: groupId,
  });
}
