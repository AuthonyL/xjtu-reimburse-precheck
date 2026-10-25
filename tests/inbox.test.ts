import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInbox } from '../src/core/inbox.js';
import { readManual, validateManual } from '../src/core/manual.js';
import { loadConfig } from '../src/core/rules/config.js';
import { scanBatch } from '../src/core/scan.js';
import {
  ignoreFile,
  saveAttachment,
  saveManualEntry,
  unignoreFile,
} from '../src/main/manual-store.js';
import { batch } from './helpers.js';
import { syntheticTextPdf } from './pdf-fixture.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function temporary() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'precheck-inbox-')));
  dirs.push(dir);
  return dir;
}

it('收件箱包含未知、未命名及解析失败文件，按最长关键词排序并去重建议', () => {
  const current = batch([]);
  current.unidentified = [
    {
      path: '/synthetic/组A/p a y m e n t CONTRACT.txt',
      relativePath: '组A/p a y m e n t CONTRACT.txt',
      isPdf: false,
      parseFailed: false,
    },
    { path: '/synthetic/broken.pdf', relativePath: 'broken.pdf', isPdf: true, parseFailed: true },
  ];
  current.attachments = [
    {
      type: 'unnamed',
      path: '/synthetic/组B/photo.jpg',
      relativePath: '组B/photo.jpg',
      directory: '/synthetic/组B',
    },
    {
      type: 'payment',
      path: '/synthetic/confirmed.jpg',
      relativePath: 'confirmed.jpg',
      directory: '/synthetic',
    },
  ];
  const config = loadConfig({
    attachmentKeywords: {
      payment: ['pay', 'PAYMENT'],
      contract: ['pay ment contract', 'contract'],
      inventory: ['ment'],
    },
  });
  const before = structuredClone({ current, config });
  const inbox = buildInbox([current], config);
  expect(inbox).toEqual([
    {
      path: '/synthetic/组A/p a y m e n t CONTRACT.txt',
      relativePath: '组A/p a y m e n t CONTRACT.txt',
      batchDir: '/synthetic',
      group: '组A',
      kind: 'unidentified',
      suggestions: ['contract', 'payment', 'inventory'],
    },
    {
      path: '/synthetic/broken.pdf',
      relativePath: 'broken.pdf',
      batchDir: '/synthetic',
      group: '根目录',
      kind: 'parseFailed',
      suggestions: [],
    },
    {
      path: '/synthetic/组B/photo.jpg',
      relativePath: '组B/photo.jpg',
      batchDir: '/synthetic',
      group: '组B',
      kind: 'unnamed',
      suggestions: [],
    },
  ]);
  expect({ current, config }).toEqual(before);
});

it('忽略路径按批次隔离，不进入收件箱', () => {
  const first = batch([]);
  first.unidentified = [
    { path: '/synthetic/a.txt', relativePath: 'a.txt', isPdf: false, parseFailed: false },
  ];
  first.manual.ignored = ['a.txt'];
  const second = {
    ...batch([]),
    dir: '/other',
    id: '20260103',
    unidentified: [
      { path: '/other/a.txt', relativePath: 'a.txt', isPdf: false, parseFailed: false },
    ],
  };
  expect(buildInbox([first, second], loadConfig()).map((item) => item.path)).toEqual([
    '/other/a.txt',
  ]);
});

it('ignored 兼容 version 1 并规范化相对路径，拒绝越界及重复规范路径', () => {
  expect(validateManual({ ignored: ['组A/./a.txt'] })).toEqual({
    version: 1,
    entries: [],
    ignored: ['组A/a.txt'],
  });
  for (const ignored of [
    ['../a.txt'],
    ['组A/../a.txt'],
    ['/a.txt'],
    ['C:/a.txt'],
    ['组A\\a.txt'],
    ['.'],
    [''],
    [7],
    'a.txt',
    ['a.txt', './a.txt'],
  ])
    expect(() => validateManual({ ignored })).toThrow();
});

it('忽略仅移除未识别诊断，解析失败仍提示，撤销忽略恢复收件箱', async () => {
  const dir = await temporary();
  await writeFile(join(dir, 'unknown.pdf'), syntheticTextPdf([['Synthetic document', 20, 20]]));
  await writeFile(join(dir, 'broken.pdf'), 'not a PDF');
  await ignoreFile(dir, 'unknown.pdf');
  await ignoreFile(dir, 'broken.pdf');
  const scanned = await scanBatch(dir);
  expect(scanned.diagnostics.some((finding) => finding.ruleId === 'unrecognized-pdf')).toBe(false);
  expect(
    scanned.diagnostics.some(
      (finding) => finding.ruleId === 'parse' && finding.files.includes(join(dir, 'broken.pdf')),
    ),
  ).toBe(true);
  expect(buildInbox([scanned], loadConfig())).toEqual([]);
  await unignoreFile(dir, 'unknown.pdf');
  expect(buildInbox([await scanBatch(dir)], loadConfig()).map((item) => item.relativePath)).toEqual(
    ['unknown.pdf'],
  );
});

it('忽略、解除忽略、手填及附件分类共享队列写前读取最新数据', async () => {
  const dir = await temporary();
  await mkdir(join(dir, '组A'));
  await writeFile(join(dir, '组A/a.txt'), 'synthetic');
  await writeFile(join(dir, 'b.txt'), 'synthetic');
  await Promise.all([
    ignoreFile(dir, '组A/./a.txt'),
    ignoreFile(dir, 'b.txt'),
    saveManualEntry(dir, { group: 'AI', currency: 'USD', amount: 10, paymentDate: '2026-01-01' }),
    saveAttachment(dir, '组A/a.txt', 'contract'),
    unignoreFile(dir, 'b.txt'),
  ]);
  expect(await readManual(dir)).toMatchObject({
    version: 1,
    ignored: ['组A/a.txt'],
    attachments: { '组A/a.txt': 'contract' },
    entries: [{ group: 'AI', amount: 10 }],
  });
  const scanned = await scanBatch(dir);
  expect(
    scanned.attachments.some(
      (attachment) => attachment.relativePath === '组A/a.txt' && attachment.type === 'contract',
    ),
  ).toBe(true);
  expect(scanned.unidentified.some((file) => file.relativePath === '组A/a.txt')).toBe(false);
});
