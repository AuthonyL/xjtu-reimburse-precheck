import path from 'node:path';
import { canBeUnnamedAttachment, identifyAttachment } from '../core/attachments.js';
import { lstat, readdir, realpath, mkdir } from 'node:fs/promises';
import { loadConfig, type RuleConfig } from '../core/rules/config.js';
import { candidateBatchDirectories, isBatchDirectoryName } from '../core/discovery.js';
import { isLaborDirectoryName } from '../core/labor/scan.js';

export interface WorkspaceLocation {
  kind: 'root' | 'batch';
  dir: string;
  contextRoot: string | null;
  referenceDir?: string;
  laborDir?: string;
}

export async function assertDirectory(dir: string) {
  const info = await lstat(dir);
  if (info.isSymbolicLink()) throw new Error('批次目录不允许使用符号链接');
  if (!info.isDirectory()) throw new Error('批次文件夹已不存在');
  if (path.relative(await realpath(dir), path.resolve(dir)) !== '')
    throw new Error('批次目录路径已变为符号链接，请重新选择文件夹');
}

export function manualPath(base: string, file: string, api = path): string {
  const rel = api.relative(api.resolve(base), api.resolve(file));
  if (!rel || api.isAbsolute(rel) || rel.split(api.sep).includes('..'))
    throw new Error('文件必须位于所选批次内');
  return rel.split(api.sep).join('/');
}

export async function detectWorkspace(
  input: string,
  config: RuleConfig = loadConfig(),
): Promise<WorkspaceLocation> {
  if (typeof input !== 'string' || !input.trim()) throw new Error('请选择文件夹');
  const dir = await realpath(input);
  if (!(await lstat(dir)).isDirectory()) throw new Error('请选择文件夹，不能选择文件');
  const isDocument = (e: { name: string; isFile: () => boolean }) =>
    e.isFile() &&
    !e.name.startsWith('.') &&
    !config.ignoredExtensions.includes(path.extname(e.name).toLowerCase()) &&
    (canBeUnnamedAttachment(e.name) ||
      /\.(xml|ofd)$/i.test(e.name) ||
      identifyAttachment(e.name, config) !== null);
  const documents = new Map<string, Promise<boolean>>();
  const hasDocuments = (d: string): Promise<boolean> => {
    let cached = documents.get(d);
    if (cached) return cached;
    cached = (async () => {
      const entries = await readdir(d, { withFileTypes: true });
      if (entries.some(isDocument)) return true;
      for (const e of entries)
        if (
          e.isDirectory() &&
          !e.isSymbolicLink() &&
          isBatchDirectoryName(e.name, config) &&
          (await hasDocuments(path.join(d, e.name)))
        )
          return true;
      return false;
    })();
    documents.set(d, cached);
    return cached;
  };
  const roots = new Map<string, Promise<'strong' | 'weak' | null>>();
  const rootKind = (d: string): Promise<'strong' | 'weak' | null> => {
    let cached = roots.get(d);
    if (cached) return cached;
    cached = (async () => {
      const entries = await readdir(d, { withFileTypes: true });
      if (
        entries.some(
          (e) =>
            e.isDirectory() &&
            !e.isSymbolicLink() &&
            (/^\d{8}$/.test(e.name) ||
              isLaborDirectoryName(e.name, config) ||
              e.name === '无法报销费用'),
        )
      )
        return 'strong';
      if (entries.some(isDocument)) return null;
      for (const child of await candidateBatchDirectories(d, config))
        if (await hasDocuments(child)) return 'weak';
      return null;
    })();
    roots.set(d, cached);
    return cached;
  };
  const hasBatches = async (d: string) => !!(await rootKind(d));
  const multipleBatches = async (d: string) => {
    let count = 0;
    for (const child of await candidateBatchDirectories(d, config))
      if ((await hasDocuments(child)) && ++count >= 2) return true;
    return false;
  };
  let referenceDir: string | undefined;
  for (let current = dir; ; current = path.dirname(current)) {
    if (path.basename(current) === '无法报销费用') referenceDir = current;
    if (current === path.dirname(current)) break;
  }
  if (referenceDir) {
    const parent = path.dirname(referenceDir);
    return {
      kind: 'batch',
      dir,
      contextRoot: (await hasBatches(parent)) ? parent : null,
      referenceDir,
    };
  }
  for (let current = dir; current !== path.dirname(current); current = path.dirname(current)) {
    if (!isLaborDirectoryName(path.basename(current), config)) continue;
    const parent = path.dirname(current);
    const grandparent = path.dirname(parent);
    const parentKind = await rootKind(parent);
    const grandKind = await rootKind(grandparent);
    const contextRoot =
      isBatchDirectoryName(path.basename(parent), config) &&
      (grandKind === 'strong' ||
        (grandKind === 'weak' && parentKind !== 'strong' && (await multipleBatches(grandparent))))
        ? grandparent
        : parentKind
          ? parent
          : null;
    return { kind: 'batch', dir, contextRoot, laborDir: current };
  }
  const parent = path.dirname(dir);
  const parentKind = await rootKind(parent);
  const currentKind = await rootKind(dir);
  const candidate = isBatchDirectoryName(path.basename(dir), config);
  if (candidate && parentKind === 'strong') return { kind: 'batch', dir, contextRoot: parent };
  if (currentKind === 'strong') return { kind: 'root', dir, contextRoot: dir };
  if (candidate && parentKind === 'weak' && (await multipleBatches(parent)))
    return { kind: 'batch', dir, contextRoot: parent };
  if (currentKind === 'weak') return { kind: 'root', dir, contextRoot: dir };
  return { kind: 'batch', dir, contextRoot: null };
}

export async function batchFile(batch: string, relative: string, allowMissing = false) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    relative.includes('\\') ||
    path.posix.isAbsolute(relative) ||
    path.win32.isAbsolute(relative) ||
    relative.split('/').includes('..')
  )
    throw new Error('文件路径必须为批次内相对路径');
  await assertDirectory(batch);
  const target = path.resolve(batch, relative);
  manualPath(batch, target);
  let current = batch;
  for (const part of path.relative(batch, target).split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('不允许使用符号链接');
    } catch (e) {
      if (!allowMissing || (e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  return target;
}

export async function outputDirectory(batch: string) {
  const dir = await batchFile(batch, '_预检', true);
  await mkdir(dir, { recursive: true });
  return dir;
}
