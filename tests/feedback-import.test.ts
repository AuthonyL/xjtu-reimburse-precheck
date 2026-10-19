import { it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { importFeedback } from '../src/core/feedback/import.js';
import { pdfItems } from './parse-fixtures.js';
async function archive() {
  const zip = new JSZip();
  zip.file(
    'meta.json',
    JSON.stringify({
      schemaVersion: 1,
      appVersion: '0.1.0',
      rulesVersion: { defaults: 'a'.repeat(12), effective: 'b'.repeat(12) },
      platform: 'synthetic',
      arch: 'x64',
      exportedAt: '2026-01-02T03:04:05Z',
      workspaceName: '合成',
    }),
  );
  zip.file(
    'feedback.json',
    JSON.stringify([{ ruleId: 'R1', type: 'unclear', note: '合成备注', directory: '合成批次' }]),
  );
  zip.file('settings-diff.json', '[]');
  zip.file('rejected-reasons.json', '[]');
  zip.file(
    'parse-issues/001.json',
    JSON.stringify({
      format: 'pdf',
      file: '合成.pdf',
      items: pdfItems(),
      result: { invoice: null },
      warnings: [],
    }),
  );
  return zip;
}
it('导入生成 fixture、默认跳过的骨架和报告，同名不覆盖', async () => {
  const out = await mkdtemp(join(tmpdir(), 'feedback-import-test-'));
  const bytes = await (await archive()).generateAsync({ type: 'nodebuffer' });
  const first = await importFeedback(bytes, out);
  expect(first.created).toHaveLength(3);
  expect(first.report).toBe(join(out, 'private', 'docs', 'feedback', '20260102-030405.md'));
  const test = first.created.find((p) => p.endsWith('.test.ts'))!;
  expect(await readFile(join(out, test), 'utf8')).toContain('it.skip');
  expect(await readFile(first.report, 'utf8')).toContain('同学用的是旧规则');
  expect(await readFile(first.report, 'utf8')).toContain('合成备注');
  const second = await importFeedback(bytes, out);
  expect(second.created).toHaveLength(0);
  expect(second.skipped).toHaveLength(3);
});
it('拒绝穿越路径、缺失 meta、坏 meta 和未知结构', async () => {
  const out = await mkdtemp(join(tmpdir(), 'feedback-invalid-'));
  const zip = await archive();
  zip.file('../逃逸.json', '{}');
  await expect(
    importFeedback(await zip.generateAsync({ type: 'nodebuffer' }), out),
  ).rejects.toThrow(/路径/);
  const invalid = await archive();
  invalid.remove('meta.json');
  await expect(
    importFeedback(await invalid.generateAsync({ type: 'nodebuffer' }), out),
  ).rejects.toThrow(/meta/);
});
it('全部诊断校验完成前不写输出，拒绝损坏的后续条目', async () => {
  const { readdir } = await import('node:fs/promises');
  const out = await mkdtemp(join(tmpdir(), 'feedback-partial-'));
  const zip = await archive();
  zip.file('parse-issues/002.json', '{}');
  await expect(
    importFeedback(await zip.generateAsync({ type: 'nodebuffer' }), out),
  ).rejects.toThrow(/格式/);
  expect(await readdir(out)).toEqual([]);
});
it('拒绝输出父目录符号链接，不写到外部目录', async () => {
  const { mkdir, symlink, readdir } = await import('node:fs/promises');
  const out = await mkdtemp(join(tmpdir(), 'feedback-link-'));
  const external = await mkdtemp(join(tmpdir(), 'feedback-external-'));
  await mkdir(join(out, 'tests'));
  await symlink(
    external,
    join(out, 'tests', 'fixtures'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await expect(
    importFeedback(await (await archive()).generateAsync({ type: 'nodebuffer' }), out),
  ).rejects.toThrow(/符号链接/);
  expect(await readdir(external)).toEqual([]);
});
it('导入的默认跳过骨架对各种解析失败仍能通过项目 TypeScript 检查', async () => {
  const { writeFile, symlink } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve } = await import('node:path');
  const out = await mkdtemp(join(tmpdir(), 'feedback-generated-typecheck-'));
  const zip = await archive();
  for (const [i, format] of ['pdf', 'xml', 'ofd', 'docx'].entries())
    zip.file(
      `parse-issues/${String(i + 1).padStart(3, '0')}.json`,
      JSON.stringify({
        format,
        file: `合成失败.${format}`,
        result: { invoice: null, error: '合成提取失败' },
        warnings: [],
      }),
    );
  const result = await importFeedback(await zip.generateAsync({ type: 'nodebuffer' }), out);
  await writeFile(join(out, 'package.json'), JSON.stringify({ type: 'module' }));
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(resolve('src'), join(out, 'src'), linkType);
  await symlink(resolve('node_modules'), join(out, 'node_modules'), linkType);
  const files = result.created.filter((p) => p.endsWith('.test.ts')).map((p) => join(out, p));
  await expect(
    promisify(execFile)(
      process.execPath,
      [
        resolve('node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2023',
        '--resolveJsonModule',
        '--skipLibCheck',
        ...files,
      ],
      { cwd: out, timeout: 30000 },
    ),
  ).resolves.toBeDefined();
}, 40000);
