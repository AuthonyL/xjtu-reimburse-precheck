import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CheckedInvoice, Report } from '../types.js';
import type { RuleConfig } from '../rules/config.js';
import { roundMoney } from '../parse/common.js';

function sheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  widths: number[],
): ExcelJS.Worksheet {
  const base = name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 27) || '未识别销方';
  let title = base;
  let n = 1;
  while (workbook.getWorksheet(title)) title = `${base}-${n++}`;
  const s = workbook.addWorksheet(title, {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  s.addRow(headers);
  s.getRow(1).font = { bold: true, name: '宋体', size: 11 };
  s.getRow(1).height = 30;
  headers.forEach((_, n) => {
    s.getColumn(n + 1).width = widths[n] ?? 20;
    if (/单价|总额/.test(headers[n]!)) s.getColumn(n + 1).numFmt = '0.00';
  });
  s.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  return s;
}
function addRow(s: ExcelJS.Worksheet, values: ExcelJS.CellValue[]): void {
  const row = s.addRow(values);
  row.font = { name: '宋体', size: 11 };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = Math.max(
    30,
    ...values.map(
      (v, n) =>
        Math.ceil(
          [...String(v ?? '')].reduce((units, c) => units + (c.charCodeAt(0) > 255 ? 2 : 1), 0) /
            (s.getColumn(n + 1).width ?? 20),
        ) * 16,
    ),
  );
  row.eachCell((cell) => {
    if (typeof cell.value === 'number')
      cell.numFmt = s.getColumn(cell.col).numFmt ?? '0.00########';
  });
}
function bySeller(items: CheckedInvoice[]): Map<string, CheckedInvoice[]> {
  const result = new Map<string, CheckedInvoice[]>();
  for (const item of items) {
    const key = item.invoice.seller.taxId || item.invoice.seller.name || '未识别销方';
    const list = result.get(key) ?? [];
    list.push(item);
    result.set(key, list);
  }
  return result;
}
export async function exportInventory(report: Report, targetDir: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const needed = new Set(
    report.groups.flatMap((g) =>
      g.requirements.filter((r) => r.type === 'inventory').flatMap((r) => r.invoiceNumbers),
    ),
  );
  const seen = new Set<string>();
  const items = report.groups
    .filter((g) => !g.group.flags.deferred)
    .flatMap((g) => g.invoices)
    .filter(
      (i) =>
        needed.has(i.invoice.number) && !seen.has(i.invoice.number) && !!seen.add(i.invoice.number),
    );
  for (const list of bySeller(items).values()) {
    const s = sheet(
      workbook,
      list[0]!.invoice.seller.name,
      ['物品名称', '型号规格', '单位', '数量', '单价(元)', '总额(元)'],
      [38, 46, 10, 12, 18, 18],
    );
    let total = 0;
    let quantity = 0;
    for (const item of list)
      for (const line of item.invoice.lines) {
        const gross =
          line.amount !== null && line.tax !== null ? roundMoney(line.amount + line.tax) : null;
        addRow(s, [
          line.name,
          line.specification,
          line.unit,
          line.quantity,
          line.grossUnitPrice,
          gross,
        ]);
        total += gross ?? 0;
        quantity += line.quantity ?? 0;
      }
    addRow(s, ['合计', '', '', quantity, null, roundMoney(total)]);
    s.lastRow!.font = { bold: true };
  }
  if (!workbook.worksheets.length)
    sheet(
      workbook,
      '入库登记清单',
      ['物品名称', '型号规格', '单位', '数量', '单价(元)', '总额(元)'],
      [38, 46, 10, 12, 18, 18],
    );
  const notes = workbook.addWorksheet('填写说明');
  notes.getColumn(1).width = 105;
  notes.addRow(['按需要入库的整张发票导出全部明细，含税总额以金额加税额计算，单价保留计算精度。']);
  notes.addRow([
    '混合实物和服务的发票，服务明细仅供对账，请人工确认学校登记口径后填写正式入库单。',
  ]);
  notes.addRow([
    '空金额或空数量表示源票未提供或无法读取，不按零值认定；合计只汇总已知值。暂缓组不导出。',
  ]);
  notes.eachRow((row) => {
    row.alignment = { wrapText: true };
    row.height = 40;
  });
  await mkdir(targetDir, { recursive: true });
  const path = join(targetDir, '入库登记清单.xlsx');
  await workbook.xlsx.writeFile(path);
  return path;
}
export async function exportHighValue(
  report: Report,
  config: RuleConfig,
  targetDir: string,
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const s = sheet(
    workbook,
    '高值材料明细',
    ['高值材料名称', '数量', '型号规格', '单价', '总额'],
    [42, 12, 46, 18, 18],
  );
  let total = 0;
  let quantity = 0;
  for (const g of report.groups.filter((g) => !g.group.flags.deferred))
    for (const i of g.invoices)
      for (const n of i.highValueLines) {
        const line = i.invoice.lines[n]!;
        const gross =
          line.amount !== null && line.tax !== null ? roundMoney(line.amount + line.tax) : null;
        addRow(s, [line.name, line.quantity, line.specification, line.grossUnitPrice, gross]);
        total += gross ?? 0;
        quantity += line.quantity ?? 0;
      }
  addRow(s, ['合计', quantity, '', null, roundMoney(total)]);
  s.lastRow!.font = { bold: true };
  const draft = workbook.addWorksheet('情况说明草稿');
  draft.getColumn(1).width = 105;
  draft.addRow(['情况说明草稿（须按实际用途和使用期核对后使用）']);
  draft.getRow(1).font = { bold: true };
  draft.addRow([config.highValueReasons[0]!]);
  draft.getCell('A2').alignment = { wrapText: true, vertical: 'top' };
  draft.getRow(2).height = 180;
  draft.addRow(['仪器类需要资产建账；此表列出所有达到单价阈值的实物，最终分类请按实际用途确认。']);
  draft.getCell('A3').alignment = { wrapText: true };
  draft.getRow(3).height = 40;
  await mkdir(targetDir, { recursive: true });
  const path = join(targetDir, '高值材料明细.xlsx');
  await workbook.xlsx.writeFile(path);
  return path;
}
