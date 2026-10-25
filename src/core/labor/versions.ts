import { buildRules } from '../rules/definitions.js';
import { ruleOption, type RuleRegistry } from '../rules/model.js';
import { withFindingId } from '../domain/finding-id.js';
import type { LaborEntry, LaborVersionGroup } from './types.js';
import type { RuleConfig } from '../rules/config.js';
import { ruleAction } from '../rules/catalog.js';

export function groupLaborVersions(
  entries: LaborEntry[],
  config: RuleConfig,
  baseDir: string,
  rules: RuleRegistry = new Map(buildRules(config).map((rule) => [rule.id, rule])),
): LaborVersionGroup[] {
  entries.forEach((e) => {
    e.counted = true;
    e.otherVersions = [];
  });
  if (!ruleOption(rules, 'L6').enabled) return [];
  const roots = entries.map((_, i) => i);
  const root = (i: number): number => (roots[i] === i ? i : (roots[i] = root(roots[i]!)));
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!.fields,
        b = entries[j]!.fields;
      if (!a.name?.trim() || a.name.normalize('NFKC').trim() !== b.name?.normalize('NFKC').trim())
        continue;
      const sameAmount =
        a.total !== null && b.total !== null && Math.abs(a.total - b.total) < 0.010000001;
      const overlap = a.dates.some(
        (d) =>
          d.precision === 'day' && b.dates.some((e) => e.precision === 'day' && d.date === e.date),
      );
      if (sameAmount || overlap) roots[root(j)] = root(i);
    }
  const sets = new Map<number, LaborEntry[]>();
  entries.forEach((e, i) => sets.set(root(i), [...(sets.get(root(i)) ?? []), e]));
  const result: LaborVersionGroup[] = [];
  const passed = (e: LaborEntry) =>
    !e.findings.some((f) => f.severity !== 'info' && f.ruleId !== 'L6');
  for (const group of sets.values()) {
    if (group.length < 2) continue;
    const chosen = [...group].sort(
      (a, b) =>
        Number(passed(b)) - Number(passed(a)) ||
        (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0) ||
        a.relativePath.localeCompare(b.relativePath),
    )[0]!;
    const files = group.map((e) => e.relativePath).sort();
    const version = {
      id: files.join('|'),
      files,
      selectedFile: chosen.relativePath,
      note: `已按 1 笔计，采用 ${chosen.relativePath}`,
    };
    result.push(version);
    for (const e of group) {
      e.counted = e === chosen;
      e.otherVersions = files.filter((f) => f !== e.relativePath);
      e.findings.push(
        withFindingId(
          {
            severity: ruleOption(rules, 'L6').severity,
            ruleId: 'L6',
            code: 'versions',
            message: `同一人有 ${group.length} 份情况说明，可能是新旧版本；请保留正确的一份，可用『放入改好的文件』替换。${version.note}`,
            action: ruleAction('L6'),
            files: group.map((e) => e.path),
            invoiceNumbers: [],
          },
          baseDir,
        ),
      );
    }
  }
  return result;
}
