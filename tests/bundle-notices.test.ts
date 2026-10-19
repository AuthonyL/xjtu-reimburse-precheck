import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleNotices, bundledPackageRoot } from '../scripts/lib/bundle-notices.js';

it('Vite的正斜杠模块ID、Windows反斜杠和UNC路径均保留许可包根目录', () => {
  expect(bundledPackageRoot('C:/work/node_modules/@synthetic/library/dist/a.js')).toBe(
    'C:/work/node_modules/@synthetic/library',
  );
  expect(bundledPackageRoot('C:\\work\\node_modules\\@synthetic\\library\\dist\\a.js')).toBe(
    'C:/work/node_modules/@synthetic/library',
  );
  expect(bundledPackageRoot('//server/share/node_modules/library/a.js')).toBe(
    '//server/share/node_modules/library',
  );
  expect(bundledPackageRoot('/work/src/main.ts')).toBeNull();
});

it('bundle附带所用第三方包许可，合并同包模块并保留原始许可正文', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-notices-'));
  try {
    const root = join(dir, 'node_modules/@synthetic/library');
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: '@synthetic/library', version: '1.0.0', license: 'MIT' }),
    );
    await writeFile(join(root, 'LICENSE'), 'SYNTHETIC COPYRIGHT\nPermission text');
    const result = await bundleNotices([
      join(root, 'dist/a.js'),
      join(root, 'dist/b.js'),
      join(dir, 'src/main.ts'),
    ]);
    expect(result).toContain('SYNTHETIC COPYRIGHT\nPermission text');
    expect(result.match(/@synthetic\/library@1.0.0/g)).toHaveLength(1);
    expect(result).not.toContain(dir);
    const windowsIds = await bundleNotices([join(root, 'dist/a.js').replaceAll('/', '\\')]);
    expect(windowsIds).toBe(result);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
