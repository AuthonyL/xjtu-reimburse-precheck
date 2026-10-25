import { expect, it } from 'vitest';
import { checkBatch as legacy } from '../src/core/rules/engine-legacy.js';
import { checkBatch } from '../src/core/rules/engine/index.js';
import { checkBatch as publicCheckBatch } from '../src/core/index.js';
import { buildReport } from '../src/core/report.js';
import type { CheckResult } from '../src/core/types.js';
import { edgeCorpus } from './engine-parity-edge-corpus.js';
import { parityCorpus } from './engine-parity-corpus.js';

const corpus = [...parityCorpus(), ...edgeCorpus()];
function normalized(result: CheckResult) {
  const sort = <T>(items: T[]) =>
    [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    ...result,
    findings: sort(result.findings),
    groups: result.groups.map((group) => ({ ...group, requirements: sort(group.requirements) })),
  };
}
it('语料至少覆盖 150 个合成批次，公开入口使用新引擎', () => {
  expect(corpus.length).toBeGreaterThanOrEqual(150);
  expect(publicCheckBatch).toBe(checkBatch);
});
it.each(corpus)('$name 新旧 findings、requirements、金额、报告与顺序一致', (scenario) => {
  const { batch, config, context } = scenario;
  const before = structuredClone({ batch, config, context });
  const oldResult = legacy(batch, config, context);
  const result = checkBatch(batch, config, context);
  expect(normalized(result)).toEqual(normalized(oldResult));
  // 同时锁定原始顺序，确保同级别同规则的界面展示也不改变。
  expect(result).toEqual(oldResult);
  expect(buildReport(result)).toEqual(buildReport(oldResult));
  expect({ batch, config, context }).toEqual(before);
});
