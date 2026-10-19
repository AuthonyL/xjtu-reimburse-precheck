import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, open } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import type {
  ReplacementHistory,
  ReplacementRecord,
  ReplacementFile,
} from '../../core/correction/types.js';
import { safeRelative } from '../../core/correction/placement.js';
import { assertDirectory, batchFile } from '../paths.js';
import { readJson, writeJson } from '../json-store.js';
import { fileHash } from './files.js';
import { retryFileOperation, removePath } from '../file-operations.js';

const LOG = '_预检/旧版/log.json';
export interface CorrectionWritePlan {
  retained?: ReplacementFile[];
  operation?: ReplacementRecord['operation'];
  destination: string;
  archive: string[];
  copies: { from: string; to: string }[];
  source: string;
  target: string;
  targetKey: string;
}
function livePath(path: string): string {
  safeRelative(path);
  if (
    (path.split('/').includes('_预检') && path !== '_预检/manual.json') ||
    path.split('/').includes('无法报销费用')
  )
    throw new Error('不允许写入该受保护路径');
  return path;
}
async function writable(dir: string) {
  await assertDirectory(dir);
  for (let p = dir; p !== dirname(p); p = dirname(p))
    if (basename(p) === '无法报销费用') throw new Error('拒票目录只读，不允许放入文件');
}
function validateHistory(raw: unknown): ReplacementHistory {
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as ReplacementHistory).version !== 1 ||
    !Array.isArray((raw as ReplacementHistory).records)
  )
    throw new Error('替换记录格式不合法');
  const history = raw as ReplacementHistory;
  const ids = new Map<string, ReplacementRecord>();
  const undone = new Set<string>();
  for (const r of history.records) {
    if (
      !r ||
      !['apply', 'undo'].includes(r.kind) ||
      typeof r.id !== 'string' ||
      !/^[\da-f-]{36}$/.test(r.id) ||
      ids.has(r.id) ||
      typeof r.at !== 'string' ||
      Number.isNaN(Date.parse(r.at)) ||
      typeof r.target !== 'string' ||
      typeof r.targetKey !== 'string' ||
      typeof r.source !== 'string' ||
      !Array.isArray(r.archived) ||
      !Array.isArray(r.inserted)
    )
      throw new Error('替换记录字段不合法');
    livePath(r.destination);
    if (r.operation !== undefined && !['confirm-attachment', 'reuse-file'].includes(r.operation))
      throw new Error('替换记录操作不合法');
    if (r.retained !== undefined && !Array.isArray(r.retained))
      throw new Error('保留文件记录不合法');
    for (const f of r.retained ?? []) {
      livePath(f.path);
      if (!/^[\da-f]{64}$/.test(f.sha256)) throw new Error('保留文件校验不合法');
    }
    for (const f of r.inserted) {
      livePath(f.path);
      if (!/^[\da-f]{64}$/.test(f.sha256)) throw new Error('替换记录内容校验不合法');
    }
    for (const f of r.archived) {
      livePath(f.original);
      safeRelative(f.path);
      if (!/^_预检\/旧版\/\d{8}-\d{6}\/.+/.test(f.path) || !/^[\da-f]{64}$/.test(f.sha256))
        throw new Error('旧版记录路径或校验不合法');
    }
    if (r.kind === 'undo') {
      if (!r.undoOf || ids.get(r.undoOf)?.kind !== 'apply' || undone.has(r.undoOf))
        throw new Error('撤销记录关联不合法');
      undone.add(r.undoOf);
    }
    if (
      new Set(r.inserted.map((f) => f.path)).size !== r.inserted.length ||
      new Set(r.archived.map((f) => f.original)).size !== r.archived.length
    )
      throw new Error('替换记录路径重复');
    ids.set(r.id, r);
  }
  return history;
}
export async function readReplacementHistory(dir: string): Promise<ReplacementHistory> {
  const file = await batchFile(dir, LOG, true);
  return validateHistory(await readJson(file, { version: 1, records: [] }));
}
async function exists(file: string) {
  try {
    await lstat(file);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}
function stamp(date: Date) {
  const n = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}${n(date.getMonth() + 1)}${n(date.getDate())}-${n(date.getHours())}${n(date.getMinutes())}${n(date.getSeconds())}`;
}
async function archiveDirectory(dir: string) {
  let time = Date.now();
  for (; ; time += 1000) {
    const rel = '_预检/旧版/' + stamp(new Date(time));
    const file = await batchFile(dir, rel, true);
    if (await exists(file)) continue;
    await mkdir(file, { recursive: true });
    return rel;
  }
}
async function move(dir: string, from: string, to: string) {
  const source = await batchFile(dir, from);
  const dest = await batchFile(dir, to, true);
  if (await exists(dest)) throw new Error('落点已有文件，已停止以免覆盖');
  await mkdir(dirname(dest), { recursive: true });
  await retryFileOperation('移动文件', () => rename(source, dest));
}
export async function commitCorrection(
  dir: string,
  plan: CorrectionWritePlan,
): Promise<ReplacementRecord> {
  await writable(dir);
  livePath(plan.destination);
  plan.archive.forEach(livePath);
  plan.copies.forEach((f) => livePath(f.to));
  if (
    (!plan.copies.length && !plan.archive.length) ||
    (!plan.copies.some((f) => f.to === plan.destination) &&
      !plan.retained?.some((f) => f.path === plan.destination)) ||
    (plan.retained ?? []).some(
      (f) => plan.archive.includes(f.path) || plan.copies.some((c) => c.to === f.path),
    ) ||
    new Set(plan.archive).size !== plan.archive.length ||
    new Set(plan.copies.map((f) => f.to)).size !== plan.copies.length
  )
    throw new Error('文件操作计划不合法');
  for (const f of plan.retained ?? []) {
    livePath(f.path);
    if ((await fileHash(await batchFile(dir, f.path))) !== f.sha256)
      throw new Error('保留文件已变化，请重新检查');
  }
  const history = await readReplacementHistory(dir);
  const archiveHashes = await Promise.all(
    plan.archive.map(async (original) => ({
      original,
      sha256: await fileHash(await batchFile(dir, original)),
    })),
  );
  const copies = await Promise.all(
    plan.copies.map(async (f) => ({
      ...f,
      sha256: await fileHash(f.from),
      bytes: await readFile(f.from),
    })),
  );
  for (const f of copies) {
    const dest = await batchFile(dir, f.to, true);
    if ((await exists(dest)) && !plan.archive.includes(f.to))
      throw new Error('目标已有文件，不能覆盖');
  }
  const folder = await archiveDirectory(dir);
  const moved: { original: string; path: string; sha256: string }[] = [];
  const created: string[] = [];
  try {
    for (const f of archiveHashes) {
      if ((await fileHash(await batchFile(dir, f.original))) !== f.sha256)
        throw new Error('原文件已变化，请重新模拟');
      const path = folder + '/' + f.original;
      await move(dir, f.original, path);
      moved.push({ ...f, path });
    }
    for (const f of copies) {
      const dest = await batchFile(dir, f.to, true);
      await mkdir(dirname(dest), { recursive: true });
      const handle = await retryFileOperation('创建文件', () => open(dest, 'wx'));
      created.push(f.to);
      try {
        await handle.writeFile(f.bytes);
      } finally {
        await handle.close();
      }
    }
    const record: ReplacementRecord = {
      id: randomUUID(),
      kind: 'apply',
      ...(plan.operation ? { operation: plan.operation } : {}),
      ...(plan.retained?.length ? { retained: plan.retained } : {}),
      at: new Date().toISOString(),
      target: plan.target,
      targetKey: plan.targetKey,
      source: plan.source,
      destination: plan.destination,
      archived: moved,
      inserted: copies.map((f) => ({ path: f.to, sha256: f.sha256 })),
    };
    await writeJson(await batchFile(dir, LOG, true), {
      version: 1,
      records: [...history.records, record],
    });
    return record;
  } catch (error) {
    for (const f of created.reverse()) await removePath(await batchFile(dir, f, true));
    for (const f of moved.reverse()) await move(dir, f.path, f.original);
    throw error;
  }
}
export async function undoCorrection(dir: string, expectedId?: string): Promise<ReplacementRecord> {
  await writable(dir);
  const history = await readReplacementHistory(dir);
  const undone = new Set(history.records.flatMap((r) => (r.undoOf ? [r.undoOf] : [])));
  const original = [...history.records]
    .reverse()
    .find((r) => r.kind === 'apply' && !undone.has(r.id));
  if (!original) throw new Error('没有可撤销的替换记录');
  if (expectedId && original.id !== expectedId)
    throw new Error('本次放入已撤销或有更新，请到替换记录核对');
  for (const f of original.inserted)
    if ((await fileHash(await batchFile(dir, f.path))) !== f.sha256)
      throw new Error('放入后的文件已有修改，不能自动撤销');
  for (const f of original.archived) {
    if ((await fileHash(await batchFile(dir, f.path))) !== f.sha256)
      throw new Error('旧版文件已有变化，不能自动撤销');
    const dest = await batchFile(dir, f.original, true);
    if ((await exists(dest)) && !original.inserted.some((i) => i.path === f.original))
      throw new Error('原文件位置已有新内容，不能覆盖');
  }
  const folder = await archiveDirectory(dir);
  const moved: ReplacementRecord['archived'] = [];
  const restored: ReplacementRecord['archived'] = [];
  try {
    for (const f of original.inserted) {
      const path = folder + '/撤销放入/' + f.path;
      await move(dir, f.path, path);
      moved.push({ original: f.path, path, sha256: f.sha256 });
    }
    for (const f of original.archived) {
      await move(dir, f.path, f.original);
      restored.push(f);
    }
    const record: ReplacementRecord = {
      id: randomUUID(),
      kind: 'undo',
      at: new Date().toISOString(),
      target: original.target,
      targetKey: original.targetKey,
      source: original.source,
      destination: original.destination,
      archived: moved,
      inserted: original.archived.map((f) => ({ path: f.original, sha256: f.sha256 })),
      undoOf: original.id,
    };
    await writeJson(await batchFile(dir, LOG, true), {
      version: 1,
      records: [...history.records, record],
    });
    return record;
  } catch (error) {
    for (const f of restored.reverse()) await move(dir, f.original, f.path);
    for (const f of moved.reverse()) await move(dir, f.path, f.original);
    throw error;
  }
}
