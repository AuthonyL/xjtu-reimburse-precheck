import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ConfigDifference, RuleUpgradeItem, UpgradeChoices } from '../../shared/feedback.js';

declare const __DEFAULTS_SHA256__: string;
export const DEFAULTS_HASH =
  typeof __DEFAULTS_SHA256__ === 'string'
    ? __DEFAULTS_SHA256__
    : createHash('sha256')
        .update(readFileSync(new URL('../rules/defaults.json', import.meta.url)))
        .digest('hex');
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export const hashConfig = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function configDifferences(
  defaults: unknown,
  current: unknown,
  prefix = '',
): ConfigDifference[] {
  if (equal(defaults, current)) return [];
  if (object(defaults) && object(current))
    return [...new Set([...Object.keys(defaults), ...Object.keys(current)])].flatMap((k) =>
      configDifferences(defaults[k], current[k], prefix ? `${prefix}.${k}` : k),
    );
  const diff: ConfigDifference = { path: prefix, defaultValue: defaults, currentValue: current };
  if (
    Array.isArray(defaults) &&
    Array.isArray(current) &&
    [...defaults, ...current].every((v) => typeof v === 'string')
  ) {
    diff.added = current.filter((v) => !defaults.includes(v));
    diff.removed = defaults.filter((v) => !current.includes(v));
  }
  return [diff];
}
export function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => (object(v) ? v[key] : undefined), value);
}
export function setAt(value: unknown, path: string, next: unknown): void {
  const keys = path.split('.');
  if (!keys.length || keys.some((k) => !k || ['__proto__', 'prototype', 'constructor'].includes(k)))
    throw new Error('配置路径不合法');
  let target = value as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    if (!object(target[key])) target[key] = {};
    target = target[key] as Record<string, unknown>;
  }
  if (next === undefined) delete target[keys.at(-1)!];
  else target[keys.at(-1)!] = structuredClone(next);
}
export function upgradeItems(old: unknown, next: unknown, current: unknown): RuleUpgradeItem[] {
  return configDifferences(old, next).map((d) => ({
    path: d.path,
    oldDefault: d.defaultValue,
    newDefault: d.currentValue,
    currentValue: valueAt(current, d.path),
  }));
}
export function applyUpgradeChoices<T>(
  old: unknown,
  next: unknown,
  current: T,
  choices: UpgradeChoices,
): T {
  const result = structuredClone(current);
  for (const item of upgradeItems(old, next, current)) {
    const choice = choices[item.path];
    if (choice !== 'default' && choice !== 'mine')
      throw new Error(`请为 ${item.path} 选择采用新默认或保留我的`);
    if (choice === 'default') setAt(result, item.path, item.newDefault);
  }
  return result;
}
