import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { CLAIM_FILE, readClaimFile } from '../core/claim-store.js';
import type { Claim, ClaimState } from '../core/domain/claim.js';
import type { Registry, RegistryEntry } from '../core/domain/registry.js';
import { canonicalPath, pathKey } from '../core/fs-path.js';
import type { Batch } from '../core/types.js';
import { readJson, SerialQueue, writeJson } from './json-store.js';
import { assertDirectory, batchFile } from './paths.js';

// Separate store instances share the same cache, so writes share a queue too.
const queue = new SerialQueue();
const empty = (): Registry => ({ version: 1, entries: [] });
const states: readonly ClaimState[] = [
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

function registry(value: unknown): Registry {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.entries)) return empty();
  const entries: RegistryEntry[] = [];
  for (const valueEntry of value.entries) {
    if (
      !object(valueEntry) ||
      !text(valueEntry.number) ||
      !text(valueEntry.claimId) ||
      !text(valueEntry.batchDir) ||
      !isAbsolute(valueEntry.batchDir) ||
      !states.includes(valueEntry.state as ClaimState) ||
      typeof valueEntry.seller !== 'string' ||
      typeof valueEntry.total !== 'number' ||
      !Number.isFinite(valueEntry.total) ||
      typeof valueEntry.currency !== 'string' ||
      typeof valueEntry.date !== 'string' ||
      !text(valueEntry.seenAt) ||
      (valueEntry.sha256 !== undefined &&
        (!Array.isArray(valueEntry.sha256) ||
          valueEntry.sha256.some((hash: unknown) =>
            typeof hash !== 'string' ? true : !/^[\da-f]{64}$/i.test(hash),
          )))
    )
      return empty();
    entries.push({
      number: valueEntry.number,
      claimId: valueEntry.claimId,
      batchDir: valueEntry.batchDir,
      state: valueEntry.state as ClaimState,
      seller: valueEntry.seller,
      total: valueEntry.total,
      currency: valueEntry.currency,
      date: valueEntry.date,
      seenAt: valueEntry.seenAt,
      ...(valueEntry.sha256 !== undefined ? { sha256: [...valueEntry.sha256] as string[] } : {}),
    });
  }
  return { version: 1, entries };
}

async function historicalClaim(dir: string): Promise<Claim | null> {
  try {
    const file = await batchFile(dir, CLAIM_FILE);
    return readClaimFile(await readJson(file, undefined));
  } catch {
    // Missing, invalid, inaccessible, and linked history is not positive evidence.
    return null;
  }
}

export class RegistryStore {
  constructor(readonly dir: string) {}

  private async file(): Promise<string> {
    let dir = resolve(this.dir);
    if (process.platform === 'darwin') {
      // macOS tmpdir() may use these system aliases rather than their real paths.
      for (const alias of ['/var', '/tmp'])
        if (dir.startsWith(`${alias}/`) && (await realpath(alias)) === `/private${alias}`)
          dir = `/private${dir}`;
    }
    const file = resolve(dir, 'registry.json');
    let base = dirname(file);
    for (;;) {
      try {
        await lstat(base);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        base = dirname(base);
      }
    }
    // Validate existing ancestors before writeJson can create userData directories.
    return batchFile(base, relative(base, file).split(sep).join('/'), true);
  }

  async read(): Promise<Registry> {
    const file = await this.file();
    try {
      return registry(await readJson(file, empty()));
    } catch (error) {
      if (error instanceof SyntaxError) return empty();
      throw error;
    }
  }

  rebuild(batches: Batch[]): Promise<Registry> {
    return queue.run(async () => {
      const previous = await this.read();
      const current = new Map<string, { batch: Batch; dir: string }>();
      const directories = new Set<string>();
      for (const batch of batches) {
        await assertDirectory(batch.dir);
        const dir = canonicalPath(batch.dir);
        directories.add(pathKey(dir));
        if (batch.claim) current.set(batch.claim.id, { batch, dir });
      }
      const claims = new Map<string, Promise<Claim | null>>();
      const entries: RegistryEntry[] = [];
      for (const entry of previous.entries) {
        if (current.has(entry.claimId)) continue;
        let claim = claims.get(entry.batchDir);
        if (!claim) {
          claim = historicalClaim(entry.batchDir);
          claims.set(entry.batchDir, claim);
        }
        const existing = await claim;
        if (existing?.id === entry.claimId && !directories.has(pathKey(entry.batchDir)))
          entries.push({ ...entry, state: existing.state });
      }
      const seenAt = new Date().toISOString();
      for (const [claimId, { batch, dir }] of current) {
        for (const invoice of batch.invoices) {
          if (!invoice.number.trim()) continue;
          const hashes = [...new Set(invoice.sources.flatMap((s) => (s.sha256 ? [s.sha256] : [])))];
          entries.push({
            number: invoice.number,
            claimId,
            batchDir: dir,
            state: batch.claim!.state,
            seller: invoice.seller.name,
            total: invoice.total,
            currency: invoice.currency,
            date: invoice.date,
            seenAt,
            ...(hashes.length ? { sha256: hashes } : {}),
          });
        }
      }
      const next: Registry = { version: 1, entries };
      await writeJson(await this.file(), next);
      return next;
    });
  }
}
