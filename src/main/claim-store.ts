import { randomUUID } from 'node:crypto';
import { lstat, mkdir, utimes } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CLAIM_FILE, readClaimFile } from '../core/claim-store.js';
import { defaultClaim, validateClaim, type Claim, type ClaimState } from '../core/domain/claim.js';
import { applyTransition } from '../core/domain/transitions.js';
import { readJson, writeJson, SerialQueue } from './json-store.js';
import { batchFile } from './paths.js';

const queue = new SerialQueue();

async function readOrCreateClaim(batchDir: string): Promise<Claim> {
  const file = await batchFile(batchDir, CLAIM_FILE, true);
  let raw: unknown;
  try {
    raw = await readJson(file, undefined);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('报销单文件不是有效的 JSON');
    throw error;
  }
  const existing = readClaimFile(raw);
  if (existing) return existing;
  const claim = defaultClaim(randomUUID(), new Date().toISOString());
  const before = await lstat(batchDir);
  const created = await mkdir(dirname(file), { recursive: true });
  // 无票据日期的批次按目录修改时间排序，身份文件不能改变该时间。
  if (created) await utimes(batchDir, before.atimeMs / 1000, before.mtimeMs / 1000);
  await writeJson(file, claim);
  return claim;
}

export function ensureClaim(batchDir: string): Promise<Claim> {
  return queue.run(() => readOrCreateClaim(batchDir));
}

function update(batchDir: string, edit: (claim: Claim) => Claim): Promise<Claim> {
  return queue.run(async () => {
    const next = validateClaim(edit(await readOrCreateClaim(batchDir)));
    await writeJson(await batchFile(batchDir, CLAIM_FILE, true), next);
    return next;
  });
}

export type ClaimMeta = Pick<Claim, 'claimant' | 'project' | 'fund'>;
export function transitionClaim(batchDir: string, to: ClaimState, note?: string): Promise<Claim> {
  return update(batchDir, (claim) => applyTransition(claim, to, new Date().toISOString(), note));
}
export function updateClaimMeta(batchDir: string, meta: ClaimMeta): Promise<Claim> {
  return update(batchDir, (claim) => {
    if (
      !meta ||
      typeof meta !== 'object' ||
      Array.isArray(meta) ||
      Object.keys(meta).some((k) => !['claimant', 'project', 'fund'].includes(k))
    )
      throw new Error('报销单元数据格式不合法');
    return { ...claim, ...meta };
  });
}
export function setWaiver(batchDir: string, findingId: string, reason: string): Promise<Claim> {
  return update(batchDir, (claim) => {
    if (typeof findingId !== 'string' || !findingId.trim()) throw new Error('问题标识不能为空');
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('豁免理由不能为空');
    return {
      ...claim,
      waivers: [
        ...claim.waivers.filter((w) => w.findingId !== findingId),
        { findingId, reason: reason.trim(), at: new Date().toISOString() },
      ],
    };
  });
}
export function removeWaiver(batchDir: string, findingId: string): Promise<Claim> {
  return update(batchDir, (claim) => ({
    ...claim,
    waivers: claim.waivers.filter((w) => w.findingId !== findingId),
  }));
}

/** 仅迁移旧提交记录，使用原始时间且不重复生成创建自流转。 */
export function migrateClaimSubmission(batchDir: string, at: string): Promise<Claim> {
  return update(batchDir, (claim) =>
    claim.state !== 'draft'
      ? claim
      : {
          ...claim,
          state: 'submitted',
          transitions: [{ from: 'draft', to: 'submitted', at }],
        },
  );
}
