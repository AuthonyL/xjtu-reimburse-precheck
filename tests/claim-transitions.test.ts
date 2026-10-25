import { expect, it } from 'vitest';
import { defaultClaim, validateClaim, type ClaimState } from '../src/core/domain/claim.js';
import {
  applyTransition,
  availableTransitions,
  canTransition,
  CLAIM_STATE_LABELS,
} from '../src/core/domain/transitions.js';

const table: Record<ClaimState, ClaimState[]> = {
  draft: ['ready', 'rejected', 'cancelled'],
  ready: ['submitted', 'rejected', 'draft', 'cancelled'],
  submitted: ['reimbursed', 'returned', 'rejected', 'draft', 'cancelled'],
  returned: ['draft', 'cancelled'],
  reimbursed: [],
  rejected: [],
  cancelled: [],
};
it('穷举合法和非法迁移，终态不可迁移，状态有中文标签', () => {
  for (const from of Object.keys(table) as ClaimState[]) {
    expect(new Set(availableTransitions(from))).toEqual(new Set(table[from]));
    expect(CLAIM_STATE_LABELS[from]).toMatch(/[\u4e00-\u9fff]/);
    for (const to of Object.keys(table) as ClaimState[]) {
      expect(canTransition(from, to)).toBe(table[from].includes(to));
      const claim = { ...defaultClaim('claim-test', '2026-01-01'), state: from };
      if (canTransition(from, to))
        expect(applyTransition(claim, to, '2026-01-02', '合成备注').state).toBe(to);
      else expect(() => applyTransition(claim, to, '2026-01-02', '合成备注')).toThrow();
    }
  }
});
it('迁移不修改输入，退回及拒绝需要非空备注', () => {
  const claim = { ...defaultClaim('claim-test', '2026-01-01'), state: 'submitted' as const };
  const before = structuredClone(claim);
  const next = applyTransition(claim, 'returned', '2026-01-02', '  补交材料  ');
  expect(claim).toEqual(before);
  expect(next.transitions).toEqual([
    { from: 'submitted', to: 'returned', at: '2026-01-02', note: '补交材料' },
  ]);
  expect(next.createdAt).toBe('2026-01-01');
  for (const to of ['returned', 'rejected'] as const)
    for (const note of [undefined, '', '   '])
      expect(() => applyTransition(claim, to, '2026-01-02', note)).toThrow('备注');
  expect(() => applyTransition(claim, 'draft', '')).toThrow('时间');
});
it('创建时间独立存储，旧文件从首条 transition 取时间', () => {
  const claim = defaultClaim('claim-test', '2026-01-01');
  expect(claim.createdAt).toBe('2026-01-01');
  expect(claim.transitions).toEqual([]);
  const { createdAt: _, ...old } = claim;
  expect(
    validateClaim({ ...old, transitions: [{ from: 'draft', to: 'draft', at: '2025-12-01' }] })
      .createdAt,
  ).toBe('2025-12-01');
  expect(() => validateClaim({ ...old, transitions: [] })).toThrow('创建时间');
});
