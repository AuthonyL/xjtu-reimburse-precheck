import { createHash } from 'node:crypto';
import { readdir, lstat, readFile, mkdir, copyFile, utimes } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { assertDirectory, batchFile } from '../paths.js';
import { safeRelative } from '../../core/correction/placement.js';

export async function fileHash(file: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('仅支持普通文件，不允许符号链接');
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}
async function documentTree(dir: string): Promise<{ files: string[]; directories: string[] }> {
  await assertDirectory(dir);
  const files: string[] = [];
  const directories: string[] = [];
  async function visit(current: string, prefix: string) {
    for (const e of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (e.isSymbolicLink()) throw new Error('单文件检查不接受包含符号链接的目录，请先核对');
      if (rel === '_预检/旧版') continue;
      if (e.isDirectory()) {
        directories.push(rel);
        await visit(join(current, e.name), rel);
      } else if (e.isFile()) files.push(rel);
    }
  }
  await visit(dir, '');
  return { files, directories };
}
export async function documentFiles(dir: string): Promise<string[]> {
  return (await documentTree(dir)).files;
}
export async function directoryFingerprint(dirs: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const dir of [...new Set(dirs)].sort()) {
    hash.update(dir);
    const tree = await documentTree(dir);
    hash.update(JSON.stringify(tree.directories.filter((d) => d !== '_预检')));
    for (const rel of tree.files) {
      const file = await batchFile(dir, rel);
      const info = await lstat(file);
      hash.update(JSON.stringify([rel, info.size, info.mtimeMs, await fileHash(file)]));
    }
  }
  return hash.digest('hex');
}
export async function copyDocuments(dir: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const tree = await documentTree(dir);
  for (const rel of tree.directories) {
    safeRelative(rel);
    await mkdir(join(target, rel), { recursive: true });
  }
  for (const rel of tree.files) {
    safeRelative(rel);
    const source = await batchFile(dir, rel);
    const dest = join(target, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(source, dest);
    const info = await lstat(source);
    await utimes(dest, info.atime, info.mtime);
  }
}
