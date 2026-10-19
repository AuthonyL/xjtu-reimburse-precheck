import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { Document, Packer, Paragraph } from 'docx';
import { scanLaborDirectory, extractDocxText } from '../src/core/labor/scan.js';
import { exportLaborDocx, generateLaborText } from '../src/core/labor/template.js';
import { checkLabor } from '../src/core/labor/engine.js';
import { scanBatch } from '../src/core/scan.js';
import { validateManual } from '../src/core/manual.js';
import { loadConfig } from '../src/core/rules/config.js';
import { laborScan, laborText } from './labor-fixtures.js';
import { syntheticTextPdf } from './pdf-fixture.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function temp() {
  const d = await mkdtemp(join(tmpdir(), 'labor-test-'));
  dirs.push(d);
  return d;
}
it('DOCX说明、无文字层 PDF 和照片分开，输出不再扫描，劳务不混入发票', async () => {
  const dir = await temp();
  const labor = join(dir, '劳务费');
  await mkdir(labor);
  await writeFile(
    join(labor, '发放说明.docx'),
    await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(laborText)] }] })),
  );
  await writeFile(join(labor, '照片.jpg'), Buffer.from([1, 2, 3]));
  await writeFile(
    join(labor, '发放表说明附件.docx'),
    await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(laborText)] }] })),
  );
  await writeFile(join(labor, '发放表.pdf'), syntheticTextPdf([]));
  await mkdir(join(labor, '_预检'));
  await writeFile(join(labor, '_预检', '忽略.docx'), 'invalid');
  const scan = await scanLaborDirectory(labor, loadConfig());
  expect(scan.statements).toHaveLength(1);
  expect(scan.statements[0]!.parsed.name).toBe('林示例');
  expect(scan.attachments).toHaveLength(3);
  expect(scan.attachments.find((a) => a.noText)?.label).toContain(
    '发放表（无文字层，请手填金额核对）',
  );
  const invoiceScan = await scanBatch(dir);
  expect(invoiceScan.invoices).toEqual([]);
  expect(invoiceScan.attachments).toEqual([]);
  expect(invoiceScan.unidentified).toEqual([]);
  expect(invoiceScan.diagnostics).toEqual([]);
});
it('模板日期统一格式，Word标题、首行缩进、结尾和内容可读回', async () => {
  const dir = await temp();
  const entry = checkLabor(laborScan(), loadConfig()).entries[0]!;
  const text = generateLaborText(entry.fields, loadConfig());
  expect(text).toContain('2026 年 8 月 1 日、2026 年 9 月 5 日');
  expect(text).toContain('线上专家咨询服务2次，每次咨询费1100元，共计2200元');
  expect(text.endsWith('特此说明。')).toBe(true);
  expect(
    generateLaborText({ ...entry.fields, unit: '天', priceUnit: '半天' }, loadConfig()),
  ).toContain('每半天咨询费');
  const file = await exportLaborDocx(entry.fields, loadConfig(), dir);
  expect(file).toBe(join(dir, '情况说明-林示例.docx'));
  const bytes = await readFile(file);
  expect(await extractDocxText(bytes)).toContain('情况说明');
  expect(await extractDocxText(bytes)).toContain('共计2200元');
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toMatch(/w:firstLine="\d+"/);
  expect(await readdir(dir)).toEqual(['情况说明-林示例.docx']);
});
it('手填 labor 校验相对路径、枚举、金额和日期，保留原发票手填', () => {
  const data = validateManual({
    labor: {
      '子目录/说明.docx': {
        tableAmount: 2200,
        nationalExpert: true,
        title: '教授',
        dates: [{ date: '2026-08-01', precision: 'day' }],
      },
    },
  });
  expect(data.labor?.['子目录/说明.docx']?.tableAmount).toBe(2200);
  expect(data.entries).toEqual([]);
  for (const labor of [
    { '../说明.docx': {} },
    { '说明.docx': { mode: 'maybe' } },
    { '说明.docx': { tableAmount: -1 } },
    { '说明.docx': { dates: [{ date: '2026-02-30', precision: 'day' }] } },
    { '说明.docx': { unknown: true } },
  ])
    expect(() => validateManual({ labor })).toThrow();
});
it('劳务标准拒绝非法上下限、重复行和不适用枚举', () => {
  const config = loadConfig();
  config.laborStandards.consultation[0]!.min = 5000;
  expect(() => loadConfig(config)).toThrow(/上下限/);
  const duplicate = loadConfig();
  duplicate.laborStandards.other.push({ ...duplicate.laborStandards.other[0]! });
  expect(() => loadConfig(duplicate)).toThrow(/重复/);
  const bad = loadConfig();
  bad.laborStandards.other[0]!.unit = 'bad' as never;
  expect(() => loadConfig(bad)).toThrow(/单位/);
});
