import { expect, it } from 'vitest';
import { loadConfig } from '../src/core/rules/config.js';
import { exportRulesConfig } from '../src/core/rules/export.js';

it('导出默认配置省略 dupChecksum，旧配置可回读且输入不变', () => {
  const config = loadConfig();
  const before = structuredClone(config);
  const exported = exportRulesConfig(config);
  expect(exported).not.toHaveProperty('dupChecksum');
  expect(loadConfig(exported)).toEqual(config);
  expect(config).toEqual(before);
});

it('导出保留启用的 checksum 去重及其他自定义规则', () => {
  const config = loadConfig({ dupChecksum: true, thresholds: { inventory: { value: 725 } } });
  const exported = exportRulesConfig(config);
  expect(exported.dupChecksum).toBe(true);
  expect(exported.thresholds.inventory.value).toBe(725);
  expect(loadConfig(exported)).toEqual(config);
});
