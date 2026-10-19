import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function readJson(file: string, fallback: unknown): Promise<unknown> {
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new Error('配置文件不能为符号链接');
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(fallback);
    throw e;
  }
}

export async function writeJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true });
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new Error('配置文件不能为符号链接');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

export class SerialQueue {
  private pending: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pending.then(task, task);
    this.pending = next.catch(() => undefined);
    return next;
  }
}
