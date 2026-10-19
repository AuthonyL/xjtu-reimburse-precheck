import { expect, it } from 'vitest';
import { expandExclusive, expansionForSelection } from '../src/shared/navigation.js';

const tree = [
  {
    id: 'A',
    batchDir: 'A',
    children: [
      { id: 'A:g', batchDir: 'A' },
      {
        id: 'A:labor',
        batchDir: 'A/labor',
        children: [
          { id: 'A:labor:1', batchDir: 'A/labor' },
          { id: 'A:labor:2', batchDir: 'A/labor' },
        ],
      },
      { id: 'A:other', batchDir: 'A/other', children: [{ id: 'A:other:1', batchDir: 'A/other' }] },
    ],
  },
  { id: 'B', batchDir: 'B', children: [{ id: 'B:g', batchDir: 'B' }] },
  { id: 'labor', batchDir: 'labor', children: [{ id: 'labor:1', batchDir: 'labor' }] },
  { id: 'rejected', batchDir: 'rejected', children: [] },
];
it('展开顶层同级节点时收起整条旧分支，保留输入集合', () => {
  const old = new Set(['A', 'A:labor', 'A:labor:1']);
  expect([...expandExclusive(old, 'B', tree)]).toEqual(['B']);
  expect([...old]).toEqual(['A', 'A:labor', 'A:labor:1']);
  expect([...expandExclusive(new Set(['labor', 'labor:1']), 'rejected', tree)]).toEqual([
    'rejected',
  ]);
});
it('深层展开收起同级及后代，保留祖先和当前分支', () => {
  expect([...expandExclusive(new Set(['A', 'A:labor', 'A:labor:1']), 'A:other', tree)]).toEqual([
    'A',
    'A:other',
  ]);
  expect([...expandExclusive(new Set(['A', 'A:labor', 'A:labor:1']), 'A:labor:2', tree)]).toEqual([
    'A',
    'A:labor',
    'A:labor:2',
  ]);
});
it('选中批次替换展开路径，不展开普通分组或劳务说明叶子', () => {
  expect([...expansionForSelection(tree, 'A')]).toEqual(['A']);
  expect([...expansionForSelection(tree, 'A/labor')]).toEqual(['A', 'A:labor']);
  expect([...expansionForSelection(tree, 'unknown')]).toEqual([]);
});
