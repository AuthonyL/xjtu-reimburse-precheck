import type { Claim } from '../domain/claim.js';
import type { Registry, RegistryEntry } from '../domain/registry.js';
import { CLAIM_STATE_LABELS } from '../domain/transitions.js';

export const FUND_LABELS = { horizontal: '横向', vertical: '纵向', other: '其他' } as const;
export interface LedgerClaim {
  batchId: string;
  batchDir: string;
  claim: Claim;
  invoiceCount: number;
  totalCny: number;
  waived: number;
}
export const CLAIM_COLUMNS = [
  '批次',
  '状态',
  '经办人',
  '项目',
  '经费类型',
  '张数',
  'CNY 合计',
  '创建时间',
  '最近流转',
  '豁免数',
];
export const REGISTRY_COLUMNS = [
  '发票号',
  '销方',
  '金额',
  '币种',
  '开票日期',
  '所属批次',
  '状态',
  '登记时间',
];
export const displayTime = (value?: string) =>
  value ? value.replace('T', ' ').replace(/(?:\.\d+)?Z$/, ' UTC') : '—';
export const latestTransition = (claim: Claim) => claim.transitions.at(-1)?.at;
export function claimCells(row: LedgerClaim): string[] {
  return [
    row.batchId,
    CLAIM_STATE_LABELS[row.claim.state],
    row.claim.claimant || '—',
    row.claim.project || '—',
    row.claim.fund ? FUND_LABELS[row.claim.fund] : '未填',
    String(row.invoiceCount),
    row.totalCny.toFixed(2),
    displayTime(row.claim.createdAt),
    displayTime(latestTransition(row.claim)),
    String(row.waived),
  ];
}
export function registryBatch(entry: RegistryEntry, claims: LedgerClaim[]): string {
  const name = entry.batchDir.split(/[\\/]/).filter(Boolean).at(-1) || '未知批次';
  return claims.some((row) => row.batchDir === entry.batchDir) ? name : name + '（其他目录）';
}
export function registryCells(entry: RegistryEntry, claims: LedgerClaim[]): string[] {
  return [
    entry.number,
    entry.seller,
    entry.total.toFixed(2),
    entry.currency,
    entry.date || '—',
    registryBatch(entry, claims),
    CLAIM_STATE_LABELS[entry.state],
    displayTime(entry.seenAt),
  ];
}
const escape = (value: string) => value.replace(/[|\r\n]/g, ' ');
function table(columns: string[], rows: string[][]): string {
  return [columns, columns.map(() => '---'), ...rows]
    .map((row) => '| ' + row.map(escape).join(' | ') + ' |')
    .join('\n');
}
export function renderLedger(claims: LedgerClaim[], registry: Registry): string {
  const states = Object.entries(CLAIM_STATE_LABELS)
    .map(([state, label]) => `${label} ${claims.filter((row) => row.claim.state === state).length}`)
    .join(' / ');
  const total = claims
    .filter((row) => row.claim.state === 'reimbursed')
    .reduce((sum, row) => sum + row.totalCny, 0);
  return [
    '# 报销台账',
    '',
    states,
    '',
    `已报销 CNY 合计：${total.toFixed(2)} 元（已知人民币金额）。`,
    '',
    '## 报销单',
    '',
    table(CLAIM_COLUMNS, claims.map(claimCells)),
    '',
    '## 发票登记簿',
    '',
    table(
      REGISTRY_COLUMNS,
      registry.entries.map((entry) => registryCells(entry, claims)),
    ),
    '',
  ].join('\n');
}
