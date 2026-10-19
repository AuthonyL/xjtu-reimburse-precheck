import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

function contains(directory: string, file: string): boolean {
  const rel = relative(directory, file);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
}

export async function baselineOutputPath(source: string, output: string): Promise<string> {
  const parent = await realpath(dirname(resolve(output)));
  const destination = join(parent, basename(output));
  if (contains(await realpath(source), destination))
    throw new Error('解析基线不能写入真实源目录（含符号链接别名）');
  if (!contains(await realpath(tmpdir()), destination))
    throw new Error('含个人信息的解析基线只能写入系统临时目录');
  return destination;
}

export async function readOnlyTree(directory: string): Promise<{ hash: string; files: string[] }> {
  const hash = createHash('sha256');
  const files: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = join(dir, entry.name);
      const info = await lstat(file);
      hash.update(`${file}:${info.mtimeMs}:${info.size}`);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        files.push(file);
        hash.update(await readFile(file));
      }
    }
  }
  await visit(directory);
  return { hash: hash.digest('hex'), files };
}
