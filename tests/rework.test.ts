import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { invoiceFromTextItems, type PdfTextItem } from '../src/core/parse/pdf.js';
import { validateInvoice } from '../src/core/parse/common.js';
import { validateManual } from '../src/core/manual.js';
import { scanBatch } from '../src/core/scan.js';
import { checkBatch } from '../src/core/rules/engine.js';
import { buildReport } from '../src/core/report.js';
import { exportHighValue, exportInventory, renderMarkdown } from '../src/core/export/index.js';
import { batch, config, invoice, line } from './helpers.js';
import { syntheticPdf } from './pdf-fixture.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function workDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-rework-'));
  directories.push(dir);
  return dir;
}
function text(str: string, x: number, y: number, width = str.length * 5): PdfTextItem {
  return { str, x, y, width, height: 10, page: 1 };
}
function fragmentedParties(): PdfTextItem[] {
  const buyer = 'SYNTHBUYER00000001';
  const seller = 'SYNTHSELLER0000001';
  return [
    text('电子发票（普通发票）', 100, 20),
    text('发票号码：SYNTH-PARTIES', 370, 20),
    text('开票日期：2026年01月02日', 370, 40),
    text('购', 10, 68),
    text('销', 310 - 1e-13, 68),
    text('名称：', 30, 70),
    text('名称：', 330, 70),
    ...[...'合成研究大学'].map((c, n) => text(c, 70 + n * 30, 70)),
    ...[...'合成器件公司'].map((c, n) => text(c, 370 + n * 30, 70)),
    text('统一社会信用代码/纳税人识别号：', 30, 95),
    text('统一社会信用代码/纳税人识别号：', 330, 95),
    ...[...buyer].map((c, n) => text(c, 150 + n * 8, 95)),
    ...[...seller].map((c, n) => text(c, 450 + n * 8, 95)),
    ...['项目名称', '规格型号', '单位', '数量', '单价', '金额', '税率/征收率', '税额'].map((s, n) =>
      text(s, [20, 140, 230, 280, 340, 420, 490, 560][n]!, 120),
    ),
    ...['*电子元件*器件', 'Model A', '个', '1', '100', '100', '0%', '0'].map((s, n) =>
      text(s, [20, 140, 230, 280, 340, 420, 490, 560][n]!, 140),
    ),
    text('合计', 20, 180),
    text('价税合计（小写）¥100.00', 20, 200),
  ];
}

describe('税号完整性与抬头', () => {
  it('名称内容中的单字销不能当成纵排销方栏标记', () => {
    const items = fragmentedParties().filter((i) => !(i.y === 70 && i.x >= 70 && i.x < 300));
    items.push(...[...'合成技术营销大学'].map((c, n) => text(c, 70 + n * 30, 70)));
    const value = invoiceFromTextItems(items, 'synthetic.pdf')!;
    expect(value.buyer).toEqual({ name: '合成技术营销大学', taxId: 'SYNTHBUYER00000001' });
  });
  it('同栏的逐字名称和税号合并，不能以名称标签中点切栏', () => {
    const value = invoiceFromTextItems(fragmentedParties(), 'synthetic.pdf')!;
    expect(value.buyer).toEqual({ name: '合成研究大学', taxId: 'SYNTHBUYER00000001' });
    expect(value.seller).toEqual({ name: '合成器件公司', taxId: 'SYNTHSELLER0000001' });
    expect(value.warnings).toEqual([]);
  });
  it.each([15, 17, 18, 20])('合法税号长度 %s 不产生税号告警', (length) => {
    const i = invoice({
      buyer: { name: '合成大学', taxId: 'B'.repeat(length) },
      seller: { name: '合成公司', taxId: 'S'.repeat(length) },
    });
    expect(validateInvoice(i).warnings.filter((w) => w.includes('税号'))).toEqual([]);
  });
  it.each([0, 4, 16, 19])('截断税号长度 %s 告警，名称正确时不报 buyer error', (length) => {
    const i = validateInvoice(invoice({ buyer: { name: '合成大学', taxId: 'B'.repeat(length) } }));
    expect(i.warnings.some((w) => w.includes('购买方') && w.includes('税号'))).toBe(true);
    expect(checkBatch(batch([i]), config()).findings.some((f) => f.ruleId === 'buyer')).toBe(false);
  });
  it('税号长度不合法不影响名称比对，合法但错误的税号仍报错', () => {
    for (const buyer of [
      { name: '错误单位', taxId: 'SHORT' },
      { name: '合成大学', taxId: 'SYNTHBUYER00000002' },
    ]) {
      expect(
        checkBatch(batch([invoice({ buyer })]), config()).findings.some(
          (f) => f.ruleId === 'buyer' && f.severity === 'error',
        ),
      ).toBe(true);
    }
    expect(
      validateInvoice(invoice({ seller: { name: '合成公司', taxId: 'SHORT' } })).warnings.some(
        (w) => w.includes('销售方') && w.includes('税号'),
      ),
    ).toBe(true);
  });
});

describe('未命名附件与人工覆盖', () => {
  it('跨组重复来源不能把另一组的未命名附件借作本组候选', () => {
    const i = invoice({
      total: 1000,
      sources: [
        { path: '/synthetic/组A/a.pdf', relativePath: '组A/a.pdf', format: 'pdf' },
        { path: '/synthetic/组B/a.xml', relativePath: '组B/a.xml', format: 'xml' },
      ],
    });
    const b = batch([i], '组A');
    b.attachments.push({
      type: 'unnamed',
      path: '/synthetic/组B/hash.jpg',
      relativePath: '组B/hash.jpg',
      directory: '/synthetic/组B',
    });
    const payment = checkBatch(b, config()).groups[0]!.requirements.find(
      (r) => r.type === 'payment',
    )!;
    expect(payment.status).toBe('missing');
    expect(payment.candidateFiles).toEqual([]);
  });
  it('哈希图为待确认候选，覆盖后为找到，无候选仍缺失', async () => {
    const dir = await workDir();
    await mkdir(join(dir, '业务'));
    const file = '业务/abcdef0123456789abcdef0123456789.jpg';
    await writeFile(join(dir, file), 'synthetic image');
    const scanned = await scanBatch(dir);
    expect(scanned.attachments[0]).toMatchObject({ type: 'unnamed', relativePath: file });
    const i = invoice({
      total: 1000,
      sources: [{ path: join(dir, '业务/a.xml'), relativePath: '业务/a.xml', format: 'xml' }],
    });
    scanned.invoices = [i];
    scanned.groups[0]!.invoiceNumbers = [i.number];
    let report = buildReport(checkBatch(scanned, config()));
    let payment = report.groups[0]!.requirements.find((r) => r.type === 'payment')!;
    expect(payment.status).toBe('unconfirmed');
    expect(payment.candidateFiles.map((a) => a.relativePath)).toEqual([file]);
    expect(payment.note).toContain('可能已有，请确认');
    expect(report.requirementCounts).toMatchObject({ unconfirmed: 1, missing: 1 });
    expect(renderMarkdown(report)).toContain('待确认：支付记录');
    expect(renderMarkdown(report)).toContain(file);
    await mkdir(join(dir, '_预检'));
    await writeFile(
      join(dir, '_预检/manual.json'),
      JSON.stringify({ attachments: { [file]: 'payment' } }),
    );
    const overridden = await scanBatch(dir);
    expect(overridden.attachments[0]!.type).toBe('payment');
    overridden.invoices = [i];
    overridden.groups[0]!.invoiceNumbers = [i.number];
    report = buildReport(checkBatch(overridden, config()));
    payment = report.groups[0]!.requirements.find((r) => r.type === 'payment')!;
    expect(payment.status).toBe('found');
    expect(payment.candidateFiles).toEqual([]);
    expect(report.requirementCounts).toMatchObject({ found: 1, unconfirmed: 0 });
    overridden.attachments = [];
    expect(
      checkBatch(overridden, config()).groups[0]!.requirements.find((r) => r.type === 'payment')!
        .status,
    ).toBe('missing');
  });
  it('未识别 PDF 是候选，合法发票不会因 manual 附件覆盖而被吞掉', async () => {
    const dir = await workDir();
    await mkdir(join(dir, '业务'));
    await mkdir(join(dir, '_预检'));
    await writeFile(join(dir, '业务/123.pdf'), syntheticPdf(false));
    await writeFile(join(dir, '业务/invoice.pdf'), syntheticPdf());
    await writeFile(
      join(dir, '_预检/manual.json'),
      JSON.stringify({ attachments: { '业务/invoice.pdf': 'payment' } }),
    );
    const b = await scanBatch(dir);
    expect(b.invoices).toHaveLength(1);
    expect(b.attachments.map((a) => [a.relativePath, a.type])).toEqual([
      ['业务/123.pdf', 'unnamed'],
    ]);
    expect(b.diagnostics.some((f) => f.ruleId === 'manual')).toBe(true);
    expect(b.diagnostics.some((f) => f.ruleId === 'unrecognized-pdf')).toBe(true);
  });
  it('附件覆盖支持旧格式、仅附件格式与路径规范化，拒绝越界及非法类型', () => {
    expect(validateManual({ version: 1, entries: [] })).toMatchObject({ version: 1, entries: [] });
    expect(validateManual({ attachments: { 'AI/./01.jpg': 'payment' } }).attachments).toEqual({
      'AI/01.jpg': 'payment',
    });
    expect(() => validateManual({ attachments: { '../01.jpg': 'payment' } })).toThrow();
    expect(() => validateManual({ attachments: { 'AI/01.jpg': 'not-a-type' } })).toThrow();
    expect(() => validateManual({ attachments: [] })).toThrow();
  });
  it('其他组的候选不借用，已命名的根目录材料优先于本组候选', async () => {
    const b = batch([invoice({ total: 1000 })], '组A');
    b.invoices[0]!.sources[0]!.path = '/synthetic/组A/a.pdf';
    b.attachments.push({
      type: 'unnamed',
      path: '/synthetic/组B/01.jpg',
      relativePath: '组B/01.jpg',
      directory: '/synthetic/组B',
    });
    expect(
      checkBatch(b, config()).groups[0]!.requirements.find((r) => r.type === 'payment')!.status,
    ).toBe('missing');
    b.attachments[0] = {
      type: 'unnamed',
      path: '/synthetic/组A/01.jpg',
      relativePath: '组A/01.jpg',
      directory: '/synthetic/组A',
    };
    b.attachments.push({
      type: 'payment',
      path: '/synthetic/支付记录.jpg',
      relativePath: '支付记录.jpg',
      directory: '/synthetic',
    });
    expect(
      checkBatch(b, config()).groups[0]!.requirements.find((r) => r.type === 'payment')!.status,
    ).toBe('found');
  });
});

describe('按销方日合并与显示格式', () => {
  it('R1/R11/R2 合为每组每销方每天各一条，覆盖当天全部发票', () => {
    const invoices = [250, 250, 600].map((total, n) =>
      invoice({ number: `SYNTH-DAY-${n}`, total }),
    );
    const result = checkBatch(batch(invoices), config());
    const requirements = result.groups[0]!.requirements;
    const inventory = requirements.filter((r) => r.type === 'inventory');
    const payment = requirements.filter((r) => r.type === 'payment');
    expect(inventory).toHaveLength(1);
    expect(payment).toHaveLength(1);
    expect(inventory[0]!.ruleIds).toEqual(expect.arrayContaining(['R1', 'R11']));
    for (const r of [inventory[0]!, payment[0]!]) {
      expect(r.invoiceNumbers).toEqual(invoices.map((i) => i.number));
      for (const s of ['合成公司', '2026-01-02', '3张', '1100.00']) expect(r.reason).toContain(s);
    }
    expect(buildReport(result).requirementCounts).toEqual({
      total: 2,
      found: 0,
      unconfirmed: 0,
      missing: 2,
    });
  });
  it('不同日期或不同销方不合并，跨组触发仍按各组分别列要求', () => {
    const invoices = [
      invoice({ number: 'SYNTH-A', total: 500 }),
      invoice({ number: 'SYNTH-B', total: 500, date: '2026-01-03' }),
      invoice({
        number: 'SYNTH-C',
        total: 500,
        seller: { name: '另一合成公司', taxId: 'OTHERSELLER0000001' },
      }),
    ];
    expect(
      checkBatch(batch(invoices), config()).groups[0]!.requirements.filter(
        (r) => r.type === 'inventory',
      ),
    ).toHaveLength(3);
    const b = batch([
      invoice({ number: 'SYNTH-A', total: 250 }),
      invoice({ number: 'SYNTH-B', total: 250 }),
    ]);
    b.groups[0]!.invoiceNumbers = ['SYNTH-A'];
    b.groups.push({ ...b.groups[0]!, id: '另一组', name: '另一组', invoiceNumbers: ['SYNTH-B'] });
    const groups = checkBatch(b, config()).groups;
    expect(
      groups.every(
        (g) => g.requirements.length === 1 && g.requirements[0]!.invoiceNumbers.length === 1,
      ),
    ).toBe(true);
  });
  it('两个工作簿的价格列显示0.00，保留高精度单价原值', async () => {
    const dir = await workDir();
    const precision = 1000.123456789;
    const report = buildReport(
      checkBatch(
        batch([
          invoice({
            total: 2000.25,
            lines: [line({ quantity: 2, amount: 2000.25, tax: 0, grossUnitPrice: precision })],
          }),
        ]),
        config(),
      ),
    );
    const a = new ExcelJS.Workbook();
    await a.xlsx.readFile(await exportInventory(report, dir));
    const b = new ExcelJS.Workbook();
    await b.xlsx.readFile(await exportHighValue(report, config(), dir));
    for (const [sheet, columns] of [
      [a.worksheets[0]!, ['E', 'F']],
      [b.worksheets[0]!, ['D', 'E']],
    ] as const) {
      for (const column of columns) {
        expect(sheet.getColumn(column).numFmt).toBe('0.00');
        expect(sheet.getCell(`${column}2`).numFmt).toBe('0.00');
        expect(sheet.getCell(`${column}3`).numFmt).toBe('0.00');
      }
      expect(sheet.getCell(`${columns[0]}2`).value).toBe(precision);
    }
  });
});
