import { afterEach, expect, it, vi } from 'vitest';
import { copyDocuments, directoryFingerprint } from '../src/main/correction/files.js';
import * as jsonStore from '../src/main/json-store.js';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commitCorrection,
  undoCorrection,
  readReplacementHistory,
} from '../src/main/correction/store.js';
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function fixture() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'correction-store-')));
  dirs.push(temp);
  const dir = join(temp, 'batch');
  await mkdir(dir);
  const source = join(temp, 'new.pdf');
  await writeFile(source, 'new');
  await writeFile(join(dir, 'old.pdf'), 'old');
  return { dir, source, temp };
}
it('提交归档原件、追加日志，撤销再归档新文件并还原，来源不移动', async () => {
  const { dir, source } = await fixture();
  const record = await commitCorrection(dir, {
    destination: 'old.pdf',
    archive: ['old.pdf'],
    copies: [{ from: source, to: 'old.pdf' }],
    source,
    target: '修正合成问题',
    targetKey: 'synthetic',
  });
  expect(await readFile(join(dir, 'old.pdf'), 'utf8')).toBe('new');
  expect(await readFile(join(dir, record.archived[0]!.path), 'utf8')).toBe('old');
  expect(await readFile(source, 'utf8')).toBe('new');
  expect((await readReplacementHistory(dir)).records).toHaveLength(1);
  const undo = await undoCorrection(dir);
  expect(undo.undoOf).toBe(record.id);
  expect(await readFile(join(dir, 'old.pdf'), 'utf8')).toBe('old');
  expect(await readFile(join(dir, undo.archived[0]!.path), 'utf8')).toBe('new');
  expect((await readReplacementHistory(dir)).records.map((r) => r.kind)).toEqual(['apply', 'undo']);
  await expect(undoCorrection(dir)).rejects.toThrow(/没有/);
});
it('补交、变扩展名和 manual 作为一个事务撤销，撤销不覆盖外部编辑', async () => {
  const { dir, source } = await fixture();
  await mkdir(join(dir, '_预检'));
  await writeFile(join(dir, '_预检/manual.json'), 'old manual');
  const manual = join(dir, 'prepared.json');
  await writeFile(manual, 'new manual');
  await commitCorrection(dir, {
    destination: 'old.docx',
    archive: ['old.pdf', '_预检/manual.json'],
    copies: [
      { from: source, to: 'old.docx' },
      { from: manual, to: '_预检/manual.json' },
    ],
    source,
    target: '扩展名变化',
    targetKey: 'synthetic',
  });
  await writeFile(join(dir, 'old.docx'), 'external change');
  await expect(undoCorrection(dir)).rejects.toThrow(/变化|修改/);
  expect(await readFile(join(dir, 'old.docx'), 'utf8')).toBe('external change');
  await writeFile(join(dir, 'old.docx'), 'new');
  await undoCorrection(dir);
  expect(await readFile(join(dir, '_预检/manual.json'), 'utf8')).toBe('old manual');
  await expect(stat(join(dir, 'old.docx'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('越界、符号链接和伪造日志拒绝写入', async () => {
  const { dir, source, temp } = await fixture();
  const bad = {
    destination: '../escape.pdf',
    archive: ['old.pdf'],
    copies: [{ from: source, to: '../escape.pdf' }],
    source,
    target: '非法',
    targetKey: 'x',
  };
  await expect(commitCorrection(dir, bad)).rejects.toThrow();
  expect(await readFile(join(dir, 'old.pdf'), 'utf8')).toBe('old');
  const outside = join(temp, 'outside');
  await mkdir(outside);
  await mkdir(join(dir, '_预检'));
  await symlink(outside, join(dir, '_预检/旧版'), 'junction');
  await expect(
    commitCorrection(dir, {
      ...bad,
      destination: 'old.pdf',
      copies: [{ from: source, to: 'old.pdf' }],
    }),
  ).rejects.toThrow('符号链接');
  expect(await readFile(join(dir, 'old.pdf'), 'utf8')).toBe('old');
  await rm(join(dir, '_预检/旧版'));
  await mkdir(join(dir, '_预检/旧版'));
  await writeFile(
    join(dir, '_预检/旧版/log.json'),
    JSON.stringify({ version: 1, records: [{ kind: 'apply', destination: '../escape' }] }),
  );
  await expect(undoCorrection(dir)).rejects.toThrow();
});

it('归档、复制后日志落盘失败会回滚，撤销日志失败也恢复事务前状态', async () => {
  const { dir, source } = await fixture();
  const plan = {
    destination: 'old.pdf',
    archive: ['old.pdf'],
    copies: [{ from: source, to: 'old.pdf' }],
    source,
    target: '日志故障',
    targetKey: 'synthetic',
  };
  const spy = vi.spyOn(jsonStore, 'writeJson');
  try {
    spy.mockRejectedValueOnce(new Error('synthetic log failure'));
    await expect(commitCorrection(dir, plan)).rejects.toThrow('synthetic log failure');
    expect(await readFile(join(dir, 'old.pdf'), 'utf8')).toBe('old');
    expect((await readReplacementHistory(dir)).records).toEqual([]);
    const applied = await commitCorrection(dir, plan);
    spy.mockRejectedValueOnce(new Error('synthetic undo failure'));
    await expect(undoCorrection(dir)).rejects.toThrow('synthetic undo failure');
    expect(await readFile(join(dir, 'old.pdf'), 'utf8')).toBe('new');
    expect(await readFile(join(dir, applied.archived[0]!.path), 'utf8')).toBe('old');
    expect((await readReplacementHistory(dir)).records).toHaveLength(1);
  } finally {
    spy.mockRestore();
  }
});

it('模拟副本保留空分组，目录清单变化会使确认快照失效', async () => {
  const { dir, temp } = await fixture();
  await mkdir(join(dir, 'AI'));
  const before = await directoryFingerprint([dir]);
  const copy = join(temp, 'copy');
  await copyDocuments(dir, copy);
  expect((await stat(join(copy, 'AI'))).isDirectory()).toBe(true);
  await mkdir(join(dir, '新的空分组'));
  expect(await directoryFingerprint([dir])).not.toBe(before);
});
it('保留文件计划不允许归档或覆盖保留路径；toast 撤销不能撤掉另一笔', async () => {
  const { dir, source } = await fixture();
  const { fileHash } = await import('../src/main/correction/files.js');
  const hash = await fileHash(join(dir, 'old.pdf'));
  await expect(
    commitCorrection(dir, {
      destination: 'old.pdf',
      archive: ['old.pdf'],
      copies: [{ from: source, to: 'old.pdf' }],
      retained: [{ path: 'old.pdf', sha256: hash }],
      source,
      target: '非法保留',
      targetKey: 'key',
    }),
  ).rejects.toThrow(/计划/);
  const first = await commitCorrection(dir, {
    destination: 'old.pdf',
    archive: ['old.pdf'],
    copies: [{ from: source, to: 'old.pdf' }],
    source,
    target: '一',
    targetKey: 'key',
  });
  const second = await commitCorrection(dir, {
    destination: 'extra.pdf',
    archive: [],
    copies: [{ from: source, to: 'extra.pdf' }],
    source,
    target: '二',
    targetKey: 'key',
  });
  await expect(undoCorrection(dir, first.id)).rejects.toThrow(/更新|已撤销/);
  expect(await readFile(join(dir, 'extra.pdf'), 'utf8')).toBe('new');
  await undoCorrection(dir, second.id);
  expect(await readFile(join(dir, 'old.pdf'), 'utf8')).toBe('new');
});
