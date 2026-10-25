export type ClaimState =
  'draft' | 'ready' | 'submitted' | 'returned' | 'reimbursed' | 'rejected' | 'cancelled';
export interface ClaimTransition {
  from: ClaimState;
  to: ClaimState;
  at: string;
  note?: string;
}
export interface Waiver {
  findingId: string;
  reason: string;
  at: string;
}
export interface Claim {
  version: 1;
  id: string;
  createdAt: string;
  state: ClaimState;
  transitions: ClaimTransition[];
  claimant?: string;
  project?: string;
  fund?: 'horizontal' | 'vertical' | 'other';
  waivers: Waiver[];
}

export function defaultClaim(id: string, now: string): Claim {
  return {
    version: 1,
    id,
    createdAt: now,
    state: 'draft',
    transitions: [],
    waivers: [],
  };
}

const states: ClaimState[] = [
  'draft',
  'ready',
  'submitted',
  'returned',
  'reimbursed',
  'rejected',
  'cancelled',
];
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const state = (value: unknown): value is ClaimState =>
  typeof value === 'string' && states.includes(value as ClaimState);

export function validateClaim(value: unknown): Claim {
  if (!object(value)) throw new Error('报销单记录必须为对象');
  if (value.version !== 1) throw new Error('报销单记录需要 version: 1');
  if (!text(value.id)) throw new Error('报销单标识必须为非空字符串');
  if (!state(value.state)) throw new Error('报销单状态不合法');
  if (!Array.isArray(value.transitions)) throw new Error('报销单流转记录必须为数组');
  const transitions: ClaimTransition[] = value.transitions.map((v: unknown) => {
    if (
      !object(v) ||
      !state(v.from) ||
      !state(v.to) ||
      !text(v.at) ||
      (v.note !== undefined && typeof v.note !== 'string')
    )
      throw new Error('报销单流转记录需要合法状态、时间及可选文字备注');
    return { from: v.from, to: v.to, at: v.at, ...(v.note !== undefined ? { note: v.note } : {}) };
  });
  const createdAt = value.createdAt ?? transitions[0]?.at;
  if (!text(createdAt)) throw new Error('报销单创建时间必须为非空字符串');
  if (value.claimant !== undefined && typeof value.claimant !== 'string')
    throw new Error('报销单申请人必须为字符串');
  if (value.project !== undefined && typeof value.project !== 'string')
    throw new Error('报销单项目必须为字符串');
  if (
    value.fund !== undefined &&
    (typeof value.fund !== 'string' || !['horizontal', 'vertical', 'other'].includes(value.fund))
  )
    throw new Error('报销单经费类型不合法');
  if (!Array.isArray(value.waivers)) throw new Error('报销单豁免记录必须为数组');
  const waivers: Waiver[] = value.waivers.map((v: unknown) => {
    if (!object(v) || !text(v.findingId) || !text(v.reason) || !text(v.at))
      throw new Error('报销单豁免记录需要问题标识、理由及时间');
    return { findingId: v.findingId, reason: v.reason, at: v.at };
  });
  return {
    version: 1,
    id: value.id,
    createdAt,
    state: value.state,
    transitions,
    waivers,
    ...(value.claimant !== undefined ? { claimant: value.claimant } : {}),
    ...(value.project !== undefined ? { project: value.project } : {}),
    ...(value.fund !== undefined ? { fund: value.fund as Claim['fund'] } : {}),
  };
}
