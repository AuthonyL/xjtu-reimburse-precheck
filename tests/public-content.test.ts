import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { publicFiles, scanPublicContent } from '../scripts/lib/public-content.js';

it('公开范围按忽略规则排除私有、缓存、嵌套目录和日志，包含隐藏配置', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-content-'));
  await writeFile(join(root, '.gitignore'), 'private/\nnode_modules/\n*.log\n/cache/\n');
  const names = [
    'private/secret.txt',
    'src/node_modules/a.txt',
    'a.log',
    'cache/a.txt',
    'src/visible.ts',
    '.github/workflows/ci.yml',
    '.npmrc',
  ];
  for (const name of names) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), 'safe');
  }
  expect(await publicFiles(root)).toEqual([
    '.github/workflows/ci.yml',
    '.gitignore',
    '.npmrc',
    'src/visible.ts',
  ]);
});

it('逐类检测敏感文本，跳过二进制但不跳过普通文本', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-detection-'));
  const samples = [
    ['user path', '/' + 'Users/example/'],
    ['windows user path', 'C:\\' + 'Users\\example\\'],
    ['chat id', 'wxid' + '_example'],
    ['email domain', 'someone@' + 'qq.com'],
    ['long number', '1234567890'.repeat(2)],
  ];
  for (const [index, [, sample]] of samples.entries())
    await writeFile(join(root, `${index}.txt`), sample!);
  await writeFile(join(root, 'image.png'), Buffer.from([137, 80, 78, 71, 0, 1]));
  const violations = await scanPublicContent(root);
  expect(violations).toHaveLength(samples.length);
  expect(violations.map((v) => v.file)).not.toContain('image.png');
});

it('维护者本机的 private/forbidden-patterns.json 会追加检测，且自身不进入公开范围', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-private-patterns-'));
  await writeFile(join(root, '.gitignore'), 'private/\n');
  await mkdir(join(root, 'private'));
  await writeFile(
    join(root, 'private', 'forbidden-patterns.json'),
    JSON.stringify([{ name: 'lab secret', pattern: 'synthetic-secret-[0-9]+' }]),
  );
  await writeFile(join(root, 'notes.txt'), 'contains synthetic-secret-42');
  expect(await scanPublicContent(root)).toEqual([
    { file: 'notes.txt', line: 1, pattern: 'lab secret' },
  ]);
});

it('公开文本不含本机路径、真实长号码或课题组私有理由', async () => {
  expect(await scanPublicContent(resolve('.'))).toEqual([]);
});
