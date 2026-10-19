import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { invoiceFromTextItems, parseForeignText, textFromItems } from '../src/core/index.js';
import type { Invoice } from '../src/core/types.js';
import type { PdfTextItem } from '../src/core/parse/pdf.js';
import { packageResources, withPackagedCore } from './lib/packaged-runtime.js';
import { baselineOutputPath, readOnlyTree } from './lib/read-only-tree.js';

interface PdfRecord {
  file: string;
  items: PdfTextItem[];
  invoice: Invoice | null;
  error?: string;
}
interface Baseline {
  version: 1;
  sourceHash: string;
  records: PdfRecord[];
}

const [mode, application, rootArg, baselineArg] = process.argv.slice(2);
assert(
  (mode === 'baseline' || mode === 'compare') && application && rootArg && baselineArg,
  '用法：tsx scripts/compare-packaged-pdf.ts baseline|compare <unpacked应用> <只读发票根目录> <系统临时目录中的基线.json>',
);
const root = resolve(rootArg);
const baselineFile =
  mode === 'baseline' ? await baselineOutputPath(root, baselineArg) : resolve(baselineArg);
const before = await readOnlyTree(root);
const pdfs = before.files.filter((file) => /\.pdf$/i.test(file));

async function collect(
  extract: (file: string) => Promise<PdfTextItem[]>,
  parse: typeof invoiceFromTextItems,
  foreign: typeof parseForeignText,
  text: typeof textFromItems,
): Promise<PdfRecord[]> {
  const records: PdfRecord[] = [];
  for (const file of pdfs) {
    const fileRelative = relative(root, file).split(sep).join('/');
    try {
      const items = await extract(file);
      records.push({
        file: fileRelative,
        items,
        invoice: parse(items, fileRelative) ?? foreign(text(items), fileRelative),
      });
    } catch (error) {
      records.push({ file: fileRelative, items: [], invoice: null, error: String(error) });
    }
  }
  return records;
}

if (mode === 'baseline') {
  const base = join(packageResources(application), 'app.asar.unpacked/node_modules/pdfjs-dist');
  const pdf = (await import(
    pathToFileURL(join(base, 'legacy/build/pdf.mjs')).href
  )) as typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  pdf.GlobalWorkerOptions.workerSrc = pathToFileURL(join(base, 'legacy/build/pdf.worker.mjs')).href;
  const records = await collect(
    async (file) => {
      const task = pdf.getDocument({
        data: new Uint8Array(await readFile(file)),
        cMapUrl: join(base, 'cmaps') + sep,
        cMapPacked: true,
        standardFontDataUrl: join(base, 'standard_fonts') + sep,
        useSystemFonts: false,
        verbosity: 0,
      });
      try {
        const doc = await task.promise;
        const items: PdfTextItem[] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          for (const item of content.items) {
            if (!('str' in item) || !item.str.trim()) continue;
            const transform = pdf.Util.transform(viewport.transform, item.transform);
            items.push({
              str: item.str,
              x: transform[4]!,
              y: transform[5]!,
              width: item.width,
              height: item.height,
              page: pageNumber,
            });
          }
          page.cleanup();
        }
        return items;
      } finally {
        await task.destroy();
      }
    },
    invoiceFromTextItems,
    parseForeignText,
    textFromItems,
  );
  assert.equal((await readOnlyTree(root)).hash, before.hash, '真实目录在读取期间发生变化');
  await writeFile(
    baselineFile,
    JSON.stringify({ version: 1, sourceHash: before.hash, records } satisfies Baseline) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  assert.equal((await readOnlyTree(root)).hash, before.hash, '写入基线后源目录发生变化');
  console.log(
    `PASS 旧包基线：${records.length} 个PDF，${records.filter((r) => r.invoice).length} 张发票/收据，${records.filter((r) => r.error).length} 个读取失败；源目录只读一致；基线 ${baselineFile}`,
  );
} else {
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8')) as Baseline;
  assert.equal(baseline.version, 1);
  assert.equal(baseline.sourceHash, before.hash, '真实目录和瘦身前基线不同，请先核对源文件');
  const records = await withPackagedCore(application, async (core, extracted) => {
    const { createRequire } = await import('node:module');
    const require = createRequire(join(extracted, 'package.json'));
    assert.throws(() => require.resolve('@napi-rs/canvas'), '瘦身验证不能借用开发canvas');
    return collect(
      core.extractPdfTextItems,
      core.invoiceFromTextItems,
      core.parseForeignText,
      core.textFromItems,
    );
  });
  assert.equal(records.length, baseline.records.length, 'PDF数量变化');
  const changed = records.filter((record, n) => !isDeepStrictEqual(record, baseline.records[n]));
  for (const record of changed) console.error('FAIL 解析不一致：' + record.file);
  assert.equal((await readOnlyTree(root)).hash, before.hash, '真实目录在读取期间发生变化');
  assert.equal(changed.length, 0, '文字项、号码、日期、购销方、明细、合计或解析告警变化');
  console.log(
    `PASS ${application}：${records.length}/${records.length} 个PDF逐张完全一致（含非发票与无文字层PDF）；文字项、号码、日期、购销方、明细、合计及告警一致；无canvas；源目录只读一致`,
  );
}
