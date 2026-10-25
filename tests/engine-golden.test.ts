import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { checkBatch } from '../src/core/rules/engine/index.js';
import { checkBatch as publicCheckBatch } from '../src/core/index.js';
import golden from './engine-golden.json' with { type: 'json' };
import { normalized } from './engine-normalize.js';
import { parityCorpus } from './engine-parity-corpus.js';
import { edgeCorpus } from './engine-parity-edge-corpus.js';

const corpus = [...parityCorpus(), ...edgeCorpus()];
it('黄金语料恰好覆盖 982 条，公开入口使用当前引擎', () => {
  expect(corpus.map((s) => s.name)).toEqual(golden.map((s) => s.name));
  expect(golden).toHaveLength(982);
  expect(publicCheckBatch).toBe(checkBatch);
});
it.each(corpus)('$name 黄金哈希不变，输入不变', ({ name, batch, config, context }) => {
  const before = structuredClone({ batch, config, context });
  const hash = createHash('sha256')
    .update(JSON.stringify(normalized(checkBatch(batch, config, context))))
    .digest('hex');
  expect(hash).toBe(golden.find((entry) => entry.name === name)?.hash);
  expect({ batch, config, context }).toEqual(before);
});
