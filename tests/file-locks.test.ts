import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  commitCorrection,
  undoCorrection,
  readReplacementHistory,
} from '../src/main/correction/store.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const nativeRename = vi.mocked(fs.rename).getMockImplementation()!;
const temps: string[] = [];
afterEach(async () => {
  vi.mocked(fs.rename).mockImplementation(nativeRename);
  for (const dir of temps.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const temp = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'file-locks-')));
  temps.push(temp);
  const dir = join(temp, 'batch');
  await fs.mkdir(dir);
  await fs.writeFile(join(dir, '旧票.pdf'), 'old');
  const source = join(temp, '新票.pdf');
  await fs.writeFile(source, 'new');
  const plan = {
    destination: '旧票.pdf',
    archive: ['旧票.pdf'],
    copies: [{ from: source, to: '旧票.pdf' }],
    source,
    target: '合成替换',
    targetKey: 'synthetic',
  };
  return { dir, plan };
}
function lock(file: string, code: string, attempts = Infinity) {
  let remaining = attempts;
  vi.mocked(fs.rename).mockImplementation(async (from, to) => {
    if (from === file && remaining-- > 0) throw Object.assign(new Error('locked'), { code });
    return nativeRename(from, to);
  });
}
it.each(['EBUSY', 'EPERM'])('归档遇到 %s 短暂占用后重试完成，撤销可恢复', async (code) => {
  const { dir, plan } = await fixture();
  lock(join(dir, '旧票.pdf'), code, 1);
  await commitCorrection(dir, plan);
  expect(await fs.readFile(join(dir, '旧票.pdf'), 'utf8')).toBe('new');
  await undoCorrection(dir);
  expect(await fs.readFile(join(dir, '旧票.pdf'), 'utf8')).toBe('old');
});
it.each(['EBUSY', 'EPERM'])('归档持续 %s 时中文提示且原文件和历史不变', async (code) => {
  const { dir, plan } = await fixture();
  lock(join(dir, '旧票.pdf'), code);
  await expect(commitCorrection(dir, plan)).rejects.toThrow(/占用|权限/);
  expect(await fs.readFile(join(dir, '旧票.pdf'), 'utf8')).toBe('old');
  expect((await readReplacementHistory(dir)).records).toEqual([]);
});
it('撤销中旧版被占用时回滚已移动的新文件，保留可重试的替换记录', async () => {
  const { dir, plan } = await fixture();
  const applied = await commitCorrection(dir, plan);
  lock(join(dir, applied.archived[0]!.path), 'EPERM');
  await expect(undoCorrection(dir)).rejects.toThrow(/占用|权限/);
  expect(await fs.readFile(join(dir, '旧票.pdf'), 'utf8')).toBe('new');
  expect(await fs.readFile(join(dir, applied.archived[0]!.path), 'utf8')).toBe('old');
  expect((await readReplacementHistory(dir)).records).toHaveLength(1);
  vi.mocked(fs.rename).mockImplementation(nativeRename);
  await undoCorrection(dir);
  expect(await fs.readFile(join(dir, '旧票.pdf'), 'utf8')).toBe('old');
});
