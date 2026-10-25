import { randomUUID } from 'node:crypto';
import { lstat, mkdir, utimes } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CLAIM_FILE, readClaimFile } from '../core/claim-store.js';
import { defaultClaim, type Claim } from '../core/domain/claim.js';
import { readJson, writeJson, SerialQueue } from './json-store.js';
import { batchFile } from './paths.js';

const queue = new SerialQueue();

export function ensureClaim(batchDir: string): Promise<Claim> {
  return queue.run(async () => {
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
  });
}
