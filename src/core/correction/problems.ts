import type { Finding } from '../types.js';
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
export function problemKey(
  finding: Finding,
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
export function compareProblems(
  before: Finding[],
  after: Finding[],
  beforeDir: string,
  afterDir: string,
  targetKey?: string,
  aliases: ProblemAliases = {},
) {
  const errors = new Map<string, number>();
  const all = new Map<string, number>();
  before.forEach((f) => {
    const k = problemKey(f, beforeDir);
    all.set(k, (all.get(k) ?? 0) + 1);
    if (f.severity === 'error') errors.set(k, (errors.get(k) ?? 0) + 1);
  });
  const newErrors: Finding[] = [];
  const added: Finding[] = [];
  for (const f of after) {
    const k = problemKey(f, afterDir, aliases);
    const old = all.get(k) ?? 0;
    if (!old) added.push(f);
    else all.set(k, old - 1);
    if (f.severity === 'error') {
      const count = errors.get(k) ?? 0;
      if (!count) newErrors.push(f);
      else errors.set(k, count - 1);
    }
  }
  const resolved =
    targetKey === undefined ||
    !after.some((f) => f.severity !== 'info' && problemKey(f, afterDir, aliases) === targetKey);
  return {
    passed: resolved && newErrors.length === 0,
    resolved,
    newErrors,
    added,
    remaining: after.filter((f) => f.severity !== 'info'),
  };
}
