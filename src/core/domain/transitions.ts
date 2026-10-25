import type { Claim, ClaimState } from './claim.js';

export const CLAIM_STATE_LABELS: Record<ClaimState, string> = {
  draft: '草稿',
  ready: '待提交',
  submitted: '已提交',
  returned: '已退回',
  reimbursed: '已报销',
  rejected: '已拒绝',
  cancelled: '已取消',
};
const transitions: Record<ClaimState, readonly ClaimState[]> = {
  draft: ['ready', 'rejected', 'cancelled'],
  ready: ['submitted', 'rejected', 'draft', 'cancelled'],
  submitted: ['reimbursed', 'returned', 'rejected', 'draft', 'cancelled'],
  returned: ['draft', 'cancelled'],
  reimbursed: [],
  rejected: [],
  cancelled: [],
};

export function availableTransitions(state: ClaimState): ClaimState[] {
  return [...(transitions[state] ?? [])];
}
export function canTransition(from: ClaimState, to: ClaimState): boolean {
  return availableTransitions(from).includes(to);
}
export function applyTransition(claim: Claim, to: ClaimState, at: string, note?: string): Claim {
  if (!canTransition(claim.state, to)) throw new Error('不允许此报销单状态迁移');
  if (typeof at !== 'string' || !at.trim()) throw new Error('状态迁移需要时间');
  if (note !== undefined && typeof note !== 'string') throw new Error('状态备注必须为文字');
  const reason = note?.trim();
  if (['returned', 'rejected'].includes(to) && !reason) throw new Error('退回或拒绝需要填写备注');
  return {
    ...structuredClone(claim),
    state: to,
    transitions: [
      ...claim.transitions.map((t) => ({ ...t })),
      {
        from: claim.state,
        to,
        at,
        ...(reason ? { note: reason } : {}),
      },
    ],
  };
}
