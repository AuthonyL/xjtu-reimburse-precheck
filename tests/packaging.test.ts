import { expect, it } from 'vitest';
import { createPackageConfig } from '../scripts/lib/packaging.js';
import { isOptionalCanvasWarning, pdfResourcePaths } from '../src/core/parse/pdf.js';
import path, { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { syntheticPdf } from './pdf-fixture.js';

it('打包目标：显式 ad-hoc、双架构独立 dmg、NSIS 无 wine 资源编辑', () => {
  const mac = createPackageConfig('darwin', 'arm64');
  expect(mac.directories?.output).toBe('release');
  expect(mac.productName).toBe('报销预检');
  expect(mac.mac?.identity).toBe('-');
  expect(mac.mac?.notarize).toBe(false);
  expect(mac.mac?.artifactName).toBe('ReimbursePrecheck-${version}-mac-${arch}.${ext}');
  const win = createPackageConfig('win32', 'x64');
  expect(win.win?.signAndEditExecutable).toBe(false);
  expect(win.nsis?.oneClick).toBe(false);
  expect(win.nsis?.allowToChangeInstallationDirectory).toBe(true);
  expect(win.nsis?.createDesktopShortcut).toBe(true);
  expect(win.nsis?.createStartMenuShortcut).toBe(true);
  expect(win.nsis?.artifactName).toBe('ReimbursePrecheck-${version}-win-${arch}-setup.${ext}');
  expect(win.asarUnpack).toEqual(['node_modules/pdfjs-dist/**/*']);
});

it.each([
  ['darwin', 'arm64'],
  ['darwin', 'x64'],
  ['win32', 'x64'],
] as const)('%s-%s 只含中英文并使用最高压缩，PDF资源按白名单复制', (platform, arch) => {
  const config = createPackageConfig(platform, arch);
  expect(config.electronLanguages).toEqual(['zh-CN', 'en-US']);
  expect(config.mac?.electronLanguages).toEqual(['zh_CN', 'en_US']);
  expect(config.compression).toBe('maximum');
  const resources = (Array.isArray(config.files) ? config.files : []).find(
    (f) => typeof f !== 'string' && f.to === 'node_modules/pdfjs-dist',
  );
  expect(resources).toMatchObject({
    filter: expect.arrayContaining([
      'package.json',
      'legacy/build/pdf.mjs',
      'legacy/build/pdf.worker.mjs',
      'cmaps/**/*',
      'standard_fonts/**/*',
      'wasm/**/*',
    ]),
  });
  expect(JSON.stringify(resources)).not.toMatch(/image_decoders|\.map|types\/|web\//);
  expect(JSON.stringify(config.files)).not.toContain('@napi-rs');
});

it('只忽略可选绘图依赖的初始化警告，不吞掉其他解析警告', () => {
  expect(
    isOptionalCanvasWarning('Warning: Cannot load "@napi-rs/canvas" package: "missing".'),
  ).toBe(true);
  expect(
    isOptionalCanvasWarning('Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.'),
  ).toBe(true);
  expect(
    isOptionalCanvasWarning('Warning: Cannot polyfill `Path2D`, rendering may be broken.'),
  ).toBe(true);
  expect(isOptionalCanvasWarning('Warning: Invalid CMap data')).toBe(false);
  expect(isOptionalCanvasWarning('Error: Cannot load "@napi-rs/canvas" package')).toBe(false);
  expect(isOptionalCanvasWarning({ message: 'something else' })).toBe(false);
});

it('独立进程无 canvas 时仍提取中文，忽略初始化警告后恢复 console.warn', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-no-canvas-'));
  try {
    const file = join(dir, 'synthetic.pdf');
    await writeFile(file, syntheticPdf());
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
        import { registerHooks } from 'node:module';
        registerHooks({ resolve(specifier, context, next) {
          if (specifier.startsWith('@napi-rs/canvas')) throw new Error('SYNTH_NO_CANVAS');
          return next(specifier, context);
        }});
        const { extractPdfTextItems } = await import('./src/core/parse/pdf.ts');
        const warn = console.warn;
        const items = await extractPdfTextItems(${JSON.stringify(file)});
        console.log(JSON.stringify({ text: items.map(i => i.str).join(''), restored: console.warn === warn }));
        console.warn('keep-other-warning');
      `,
    ]);
    expect(JSON.parse(stdout)).toMatchObject({
      restored: true,
      text: expect.stringContaining('合成大学'),
    });
    expect(stderr).toBe('keep-other-warning\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('pdfjs 开发目录和打包解包目录都明确包含 cMap、标准字体及 worker', () => {
  const dev = pdfResourcePaths(join('/synthetic', 'node_modules/pdfjs-dist/package.json'));
  expect(dev.module).toBe(join('/synthetic', 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'));
  const packed = pdfResourcePaths(
    join('/synthetic', 'app.asar/node_modules/pdfjs-dist/package.json'),
  );
  const base = join('/synthetic', 'app.asar.unpacked/node_modules/pdfjs-dist');
  expect(packed.module).toBe(join(base, 'legacy/build/pdf.mjs'));
  expect(packed.worker).toBe(join(base, 'legacy/build/pdf.worker.mjs'));
  expect(packed.cMapUrl).toBe(base.replaceAll('\\', '/') + '/cmaps/');
  expect(packed.standardFontDataUrl).toBe(base.replaceAll('\\', '/') + '/standard_fonts/');
  expect(packed.wasmUrl).toBe(base.replaceAll('\\', '/') + '/wasm/');
});

it('Windows 打包路径的 pdfjs 资源目录用正斜杠结尾（反馈包 20261019-0723）', () => {
  const packed = pdfResourcePaths(
    'G:\\First_Graduate\\reimburse-precheck\\resources\\app.asar\\node_modules\\pdfjs-dist\\package.json',
    path.win32,
  );
  const base =
    'G:/First_Graduate/reimburse-precheck/resources/app.asar.unpacked/node_modules/pdfjs-dist';
  expect(packed.cMapUrl).toBe(base + '/cmaps/');
  expect(packed.standardFontDataUrl).toBe(base + '/standard_fonts/');
  expect(packed.wasmUrl).toBe(base + '/wasm/');
  expect(packed.module).toBe(
    'G:\\First_Graduate\\reimburse-precheck\\resources\\app.asar.unpacked\\node_modules\\pdfjs-dist\\legacy\\build\\pdf.mjs',
  );
});
