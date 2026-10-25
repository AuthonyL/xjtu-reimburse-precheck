import { expect, it } from 'vitest';
import { buildReport, countSeverities } from '../src/core/report.js';
import { checkBatch } from '../src/core/rules/engine.js';
import { batch, config, finding, invoice } from './helpers.js';

it('严重级计数包含零值，不改动原数组', () => {
  expect(countSeverities([])).toEqual({ error: 0, warning: 0, info: 0 });
  const findings = [
    finding({ severity: 'error' }),
    finding({ severity: 'warning' }),
    finding({ severity: 'error' }),
    finding({ severity: 'info' }),
  ];
  const before = structuredClone(findings);
  expect(countSeverities(findings)).toEqual({
    error: 2,
    warning: 1,
    info: 1,
  });
  expect(findings).toEqual(before);
});

it('未完成组依赖 manual-amount 代码，保留各条原消息对应的判定', () => {
  const b = batch([invoice({ kind: 'foreign', currency: 'USD', date: '' })], 'AI');
  b.attachments.push({
    type: 'unnamed',
    path: '/synthetic/AI/截图.png',
    relativePath: 'AI/截图.png',
    directory: '/synthetic/AI',
  });
  const result = checkBatch(b, config());
  const manual = result.findings.filter((f) => f.message.includes('请手填金额和支付日期'));
  expect(manual).toHaveLength(2);
  expect(manual.every((f) => f.code === 'manual-amount')).toBe(true);
  manual.forEach((f) => {
    f.message = '合成替换文案';
  });
  expect(buildReport(result).incompleteGroups).toEqual(['AI']);
  result.findings = result.findings.filter((f) => f.code !== 'manual-amount');
  expect(buildReport(result).incompleteGroups).toEqual([]);
});
