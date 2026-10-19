import { extractFile, statFile, getRawHeader } from '@electron/asar';
import { readFile, readdir, stat, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { syntheticPdf } from '../tests/pdf-fixture.js';
import { packageFiles, packageResources, withPackagedCore } from './lib/packaged-runtime.js';
import { verifyWindowsResources } from './lib/windows-resources.js';

// @electron/asar splits archive paths with path.sep, so Windows needs backslashes.
const asarEntry = (file: string) => file.split('/').join(sep);

const targets = process.argv.slice(2);
if (!targets.length)
  targets.push(
    'release/mac-arm64/报销预检.app',
    'release/mac/报销预检.app',
    'release/win-unpacked',
  );
for (const target of targets) await verify(resolve(target));

async function verify(directory: string): Promise<void> {
  const isMac = directory.endsWith('.app');
  const resources = packageResources(directory);
  const archive = join(resources, 'app.asar');
  const files = new Set(packageFiles(directory));
  for (const file of [
    'out/main/index.js',
    'out/main/core.js',
    'out/main/third-party-notices.txt',
    'out/preload/index.cjs',
    'out/preload/boc.cjs',
    'out/renderer/index.html',
    'out/renderer/third-party-notices.txt',
    'package.json',
  ])
    assert(files.has(file), '归档缺少 ' + file);
  const mainNotices = extractFile(archive, asarEntry('out/main/third-party-notices.txt')).toString(
    'utf8',
  );
  const rendererNotices = extractFile(
    archive,
    asarEntry('out/renderer/third-party-notices.txt'),
  ).toString('utf8');
  assert(mainNotices.includes('exceljs@') && mainNotices.includes('docx@'), 'main缺少依赖许可正文');
  assert(
    rendererNotices.includes('react@') && rendererNotices.includes('react-dom@'),
    'renderer缺少依赖许可正文',
  );
  assert(
    ![...files].some((f) => /^(src|tests|scripts|test-results)\//.test(f)),
    '归档不能包含源码或测试数据',
  );
  assert(
    ![...files].some(
      (f) => f.startsWith('node_modules/') && !/^node_modules\/pdfjs-dist(?:\/|$)/.test(f),
    ),
    '纯JS依赖或canvas不能以node_modules形式分发',
  );
  assert(![...files].some((f) => /\.node$|\.map$/.test(f)), '不应包含原生canvas或source map');
  const executable = join(directory, isMac ? 'Contents/MacOS/报销预检' : '报销预检.exe');
  const binary = await readFile(executable);
  let arch: 'arm64' | 'x64';
  if (isMac) {
    assert.equal(binary.readUInt32LE(0), 0xfeedfacf, '可执行文件不是64位Mach-O');
    const cpu = binary.readUInt32LE(4);
    assert([0x100000c, 0x1000007].includes(cpu), '不支持的Mac架构');
    arch = cpu === 0x100000c ? 'arm64' : 'x64';
  } else {
    assert.equal(binary.toString('ascii', 0, 2), 'MZ');
    const offset = binary.readUInt32LE(0x3c);
    assert.equal(binary.readUInt32LE(offset), 0x4550);
    assert.equal(binary.readUInt16LE(offset + 4), 0x8664, 'Windows必须为x64');
    arch = 'x64';
    const metadata = JSON.parse(
      extractFile(archive, asarEntry('package.json')).toString('utf8'),
    ) as {
      version: string;
    };
    const icon = await readFile(resolve('build/icon.ico'));
    const summary = verifyWindowsResources(binary, icon, metadata.version);
    assert(summary.integrity, 'exe缺少ASAR完整性资源');
    const integrity = JSON.parse(summary.integrity) as {
      file: string;
      alg: string;
      value: string;
    }[];
    const entry = integrity.find(
      (e) =>
        e.file.replaceAll('\\', '/').split('/').filter(Boolean).join('/') === 'resources/app.asar',
    );
    assert(entry && entry.alg === 'SHA256', 'exe缺少正确ASAR完整性记录');
    assert.equal(
      entry.value,
      createHash('sha256').update(getRawHeader(archive).headerString).digest('hex'),
      '资源改写破坏ASAR完整性关联',
    );
    console.log(
      `PASS Windows图标：原组ID ${summary.iconGroups.map((g) => g.id).join('/')}；尺寸 ${summary.iconGroups[0]!.sizes.join('/')}；256px像素SHA256=${summary.iconGroups[0]!.largestPixelSha256}`,
    );
    console.log(
      `PASS Windows版本：ProductName/FileDescription=报销预检；ProductVersion/FileVersion=${metadata.version}；OriginalFilename=报销预检.exe；证书目录=0；ASAR完整性关联保留`,
    );
  }
  const localesDirectory = join(
    directory,
    isMac ? 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources' : 'locales',
  );
  const locales = (await readdir(localesDirectory))
    .filter((f) => (isMac ? f.endsWith('.lproj') : f.endsWith('.pak')))
    .sort();
  assert.deepEqual(
    locales,
    isMac ? ['en.lproj', 'zh_CN.lproj'] : ['en-US.pak', 'zh-CN.pak'],
    '只保留简体中文和英文',
  );
  const expected = [
    'legacy/build/pdf.mjs',
    'legacy/build/pdf.worker.mjs',
    'cmaps/UniGB-UCS2-H.bcmap',
    'standard_fonts/LiberationSans-Regular.ttf',
    'wasm/openjpeg.wasm',
    'wasm/qcms_bg.wasm',
    'wasm/jbig2.wasm',
  ];
  for (const relative of expected) {
    const file = 'node_modules/pdfjs-dist/' + relative;
    assert(files.has(file), '归档缺少 ' + file);
    assert(
      'unpacked' in statFile(archive, asarEntry(file)) &&
        statFile(archive, asarEntry(file)).unpacked,
      '资源未解包 ' + file,
    );
    assert((await stat(join(resources, 'app.asar.unpacked', file))).size > 0, '资源为空 ' + file);
  }
  assert(
    ![...files].some((f) =>
      /^node_modules\/pdfjs-dist\/(?:build|web|image_decoders|types)\//.test(f),
    ),
    'PDF.js 包含非Node资源',
  );
  console.log(
    `PASS ${basename(directory)} ${isMac ? 'darwin' : 'win32'}-${arch}：纯JS已bundle，无canvas，仅中英文；PDF.js legacy/cMap/字体/worker/wasm齐全`,
  );

  // 每个目标仅含纯JS/平台无关PDF资源，可在当前Node隔离加载；不冒充目标平台GUI验证。
  await withPackagedCore(directory, async (core, extracted) => {
    const require = createRequire(join(extracted, 'package.json'));
    for (const dependency of [
      'react',
      'react-dom',
      'exceljs',
      'docx',
      'jszip',
      'fast-xml-parser',
      '@napi-rs/canvas',
    ])
      assert.throws(() => require.resolve(dependency), '验证不能借用开发依赖：' + dependency);
    const temporary = await mkdtemp(join(tmpdir(), 'precheck-packaged-smoke-'));
    try {
      const file = join(temporary, 'synthetic.pdf');
      await writeFile(file, syntheticPdf());
      const invoice = await core.parseInvoicePdf(file);
      assert(invoice);
      assert.equal(invoice.number, 'SYNTH-INTEGRATION');
      assert.equal(invoice.buyer.name, '合成大学');
      assert.equal(invoice.seller.name, '合成公司');
      assert.equal(invoice.total, 113);
      assert.equal(invoice.lines[0]?.name, '*电子元件*合成器件');
      const config = core.loadConfig({
        buyer: { name: invoice.buyer.name, taxId: invoice.buyer.taxId },
        thresholds: {
          inventory: { value: 1, operator: '>=' },
          highUnit: { value: 1, operator: '>=' },
        },
      });
      const batch = await core.scanBatch(temporary, { config });
      const report = core.buildReport(core.checkBatch(batch, config, {}));
      const output = join(temporary, '_预检');
      const inventory = await core.exportInventory(report, output);
      const highValue = await core.exportHighValue(report, config, output);
      for (const [file, header] of [
        [inventory, '物品名称'],
        [highValue, '高值材料名称'],
      ]) {
        const zip = await JSZip.loadAsync(await readFile(file!));
        const strings = await zip.file('xl/sharedStrings.xml')!.async('string');
        assert(
          strings.includes(header!) && strings.includes('合成器件'),
          '打包Excel缺少表头或明细',
        );
        const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
        assert(sheet.includes('<v>113</v>'), '打包Excel合计错误');
      }
      const fields = core.parseLaborText(
        '合成大学信息学院林示例副教授于2026年8月1日、9月5日就合成工艺提供线上专家咨询服务两次，每次咨询费1100元，共计2200元。现予以发放。特此说明。',
        config,
      );
      const word = await core.exportLaborDocx(fields, config, output);
      const zip = await JSZip.loadAsync(await readFile(word));
      const document = await zip.file('word/document.xml')!.async('string');
      assert(
        document.includes('情况说明') && document.includes('2200') && document.includes('林示例'),
        '打包Word缺少中文正文',
      );
      console.log(
        'PASS 打包core隔离运行：中文PDF/明细/113.00合计、两个Excel与中文Word导出回读（Node验证，不替代目标平台GUI）',
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
