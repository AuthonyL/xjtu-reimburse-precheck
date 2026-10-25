import { expect, it } from 'vitest';
import { buildRules } from '../src/core/rules/definitions.js';
import { loadConfig } from '../src/core/rules/config.js';
import type { Rule } from '../src/core/rules/model.js';

function hasFunction(value: unknown): boolean {
  return (
    typeof value === 'function' ||
    !!(value && typeof value === 'object' && Object.values(value).some(hasFunction))
  );
}
it('33 条规则唯一登记，声明式规则只有数据，restrictive 仅由 severity 推导', () => {
  const config = loadConfig();
  const rules = buildRules(config);
  expect(rules).toHaveLength(33);
  expect(new Set(rules.map((r) => r.id)).size).toBe(33);
  expect(rules.map((r) => r.id).sort()).toEqual(Object.keys(config.ruleOptions).sort());
  for (const rule of rules) {
    expect(rule.enabled).toBe(config.ruleOptions[rule.id].enabled);
    expect(rule.restrictive).toBe(rule.severity === 'error');
    if (rule.kind !== 'coded') expect(hasFunction(rule)).toBe(false);
  }
  config.ruleOptions.R1.severity = 'error';
  expect(buildRules(config).find((r) => r.id === 'R1')!.restrictive).toBe(true);
});
it('规则类别与 Phase 2 分配一致，L3 表从当前配置读取', () => {
  const expected: Record<Rule['kind'], string[]> = {
    threshold: ['R1', 'R7', 'R2', 'R11', 'R12', 'F5-documents'],
    keyword: ['R4', 'F6', 'T2', 'R6', 'F2', 'F1', 'expense'],
    taxCategory: ['R5', 'R9'],
    party: ['buyer'],
    duplicate: ['dup'],
    lookup: ['rejected'],
    laborStandard: ['L3'],
    coded: ['R13', 'R3', 'R10', 'F5', 'T1', 'L1', 'L2', 'L4', 'L5', 'L6'],
    passthrough: ['parse', 'manual', 'ofd', 'unrecognized-pdf'],
  };
  const config = loadConfig();
  const rules = buildRules(config);
  for (const [kind, ids] of Object.entries(expected))
    expect(
      rules
        .filter((r) => r.kind === kind)
        .map((r) => r.id)
        .sort(),
    ).toEqual(ids.sort());
  const standard = rules.find((r) => r.kind === 'laborStandard')!;
  expect(standard.consultation).toEqual(config.laborStandards.consultation);
  expect(standard.other).toEqual(config.laborStandards.other);
});
