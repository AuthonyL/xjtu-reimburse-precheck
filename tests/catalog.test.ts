import { expect, it } from 'vitest';
import defaults from '../src/core/rules/defaults.json' with { type: 'json' };
import {
  RULE_CATALOG,
  ATTACHMENT_CATALOG,
  GROUP_CATALOG,
  EXPENSE_CATALOG,
  GENERAL_CATALOG,
} from '../src/core/rules/catalog.js';

function leaves(value: unknown, path = ''): string[] {
  if (Array.isArray(value))
    return value[0] && typeof value[0] === 'object' ? leaves(value[0], path + '[]') : [path];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path ? path + '.' + key : key),
    );
  return [path];
}
it('defaults 每个叶子都由可编辑目录引用，包含阈值方向和映射表列', () => {
  const fields = [
    ...RULE_CATALOG.flatMap((rule) => rule.config),
    ...ATTACHMENT_CATALOG,
    ...GROUP_CATALOG,
    ...EXPENSE_CATALOG,
    ...GENERAL_CATALOG,
  ];
  const paths = new Set(
    fields.flatMap((field) =>
      field.type === 'threshold'
        ? [field.path + '.value', field.path + '.operator']
        : field.columns
          ? field.columns.map((column) => field.path + '[].' + column.key)
          : [field.path],
    ),
  );
  expect(leaves(defaults).filter((path) => !paths.has(path))).toEqual([]);
  expect(RULE_CATALOG.map((rule) => rule.id).sort()).toEqual(
    Object.keys(defaults.ruleOptions).sort(),
  );
  for (const rule of RULE_CATALOG) {
    expect(rule.action.trim()).not.toBe('');
    expect(rule.defaultSeverity).toBe(defaults.ruleOptions[rule.id].severity);
  }
});
