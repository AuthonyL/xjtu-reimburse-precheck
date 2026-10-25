import { expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportInventory, exportHighValue, exportMarkdown } from '../src/core/export/index.js';
import { checkBatch } from '../src/core/rules/engine.js';
import { buildReport } from '../src/core/report.js';
import { batch, config, invoice, line } from './helpers.js';
import { renderMarkdown } from '../src/core/export/markdown.js';
import { defaultClaim } from '../src/core/domain/claim.js';

it('汇总头部输出已填元数据和中文状态，空字段省略并转义换行', () => {
  const report = buildReport(checkBatch(batch(), config()));
  const claim = {
    ...defaultClaim('synthetic-export', '2026-01-01'),
    claimant: '合成|经办\n人',
    project: '合成项目',
    fund: 'vertical' as const,
  };
  const text = renderMarkdown(report, claim);
  expect(text).toContain('经办人：合成 经办 人');
  expect(text).toContain('项目 / 经费卡：合成项目');
  expect(text).toContain('经费类型：纵向');
  expect(text).toContain('当前状态：草稿');
  const empty = renderMarkdown(report, defaultClaim('empty', '2026-01-01'));
  expect(empty).not.toContain('经办人：');
  expect(empty).not.toContain('项目 / 经费卡：');
  expect(empty).not.toContain('经费类型：');
});

it('两个工作簿列名、含税金额、合计及情况说明草稿回读', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-export-'));
  try {
    const c = config();
    const r = buildReport(
      checkBatch(
        batch([
          invoice({
            total: 2260,
            lines: [line({ quantity: 2, amount: 2000, tax: 260, grossUnitPrice: 1130 })],
          }),
        ]),
        c,
        {},
      ),
    );
    const a = new ExcelJS.Workbook();
    await a.xlsx.readFile(await exportInventory(r, dir));
    const s = a.worksheets[0]!;
    expect(s.getRow(1).values).toEqual([
      undefined,
      '物品名称',
      '型号规格',
      '单位',
      '数量',
      '单价(元)',
      '总额(元)',
    ]);
    expect(s.getCell('E2').value).toBe(1130);
    expect(s.getCell('F2').value).toBe(2260);
    expect(s.getCell('F3').value).toBe(2260);
    const b = new ExcelJS.Workbook();
    await b.xlsx.readFile(await exportHighValue(r, c, dir));
    expect(b.worksheets[0]!.getRow(1).values).toEqual([
      undefined,
      '高值材料名称',
      '数量',
      '型号规格',
      '单价',
      '总额',
    ]);
    expect(b.worksheets[0]!.getCell('E3').value).toBe(2260);
    expect(b.getWorksheet('情况说明草稿')!.getCell('A2').value).toBe(c.highValueReasons[0]);
    expect(await readFile(await exportMarkdown(r, dir), 'utf8')).toContain('2260.00');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
