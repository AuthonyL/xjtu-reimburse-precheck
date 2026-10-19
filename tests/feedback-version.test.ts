import { expect, it } from 'vitest';
import { config } from './helpers.js';
import {
  configDifferences,
  hashConfig,
  applyUpgradeChoices,
  upgradeItems,
  DEFAULTS_HASH,
} from '../src/core/feedback/version.js';
it('配置哈希与键顺序无关，差异列出路径与关键字增删', () => {
  const base = config();
  const current = structuredClone(base);
  current.thresholds.inventory.value = 800;
  current.storeKeywords = ['亚克力', '合成店铺'];
  const diff = configDifferences(base, current);
  expect(diff).toContainEqual(
    expect.objectContaining({
      path: 'thresholds.inventory.value',
      defaultValue: 500,
      currentValue: 800,
    }),
  );
  expect(diff.find((d) => d.path === 'storeKeywords')).toMatchObject({
    added: ['合成店铺'],
    removed: ['模具'],
  });
  expect(hashConfig({ b: 1, a: 2 })).toBe(hashConfig({ a: 2, b: 1 }));
  expect(DEFAULTS_HASH).toMatch(/^[a-f0-9]{64}$/);
});
it('升级逐项选择采用新默认或保留自定义，未选择完整时不应用', () => {
  const old = config();
  const next = structuredClone(old);
  next.thresholds.inventory.value = 700;
  next.storeKeywords = ['合成默认'];
  const current = structuredClone(old);
  current.thresholds.inventory.value = 900;
  expect(upgradeItems(old, next, current)).toHaveLength(2);
  expect(
    applyUpgradeChoices(old, next, current, {
      'thresholds.inventory.value': 'mine',
      storeKeywords: 'default',
    }),
  ).toMatchObject({ thresholds: { inventory: { value: 900 } }, storeKeywords: ['合成默认'] });
  expect(() => applyUpgradeChoices(old, next, current, {})).toThrow(/选择/);
});
