import type { Finding } from '../types.js';
import { findingId as problemKey, type ProblemAliases } from '../domain/finding-id.js';
export {
  findingId as problemKey,
  relativeProblemFile,
  type ProblemAliases,
} from '../domain/finding-id.js';

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
