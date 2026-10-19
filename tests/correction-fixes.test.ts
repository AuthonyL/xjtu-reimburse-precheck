import { expect, it } from 'vitest';
import { loadConfig } from '../src/core/rules/config.js';
import { batch, config, invoice, line } from './helpers.js';
import { checkBatch } from '../src/core/rules/engine.js';
import { checkLabor } from '../src/core/labor/engine.js';
import { laborScan } from './labor-fixtures.js';

it('F5 全材料仍 error，混合票 warning 点名材料金额，级别可独立修改', () => {
  const b = batch([
    invoice({
      lines: [
        line({ name: '*设计服务*设计', taxCategory: '设计服务', amount: 1000, tax: 0 }),
        line({ name: '*电子元件*合成采购', taxCategory: '电子元件', amount: 449.5, tax: 4.5 }),
      ],
    }),
  ]);
  b.groups[0]!.flags.outsourced = true;
  b.groups[0]!.name = '委托组';
  const mixed = checkBatch(b, config()).findings.find((f) => f.ruleId === 'F5')!;
  expect(mixed.severity).toBe('warning');
  expect(mixed.message).toContain('合成采购');
  expect(mixed.message).toContain('449.50');
  expect(mixed.message).toContain('含税454.00');
  expect(
    checkBatch(b, loadConfig({ ...config(), mixedDelegatedSeverity: 'info' })).findings.find(
      (f) => f.ruleId === 'F5',
    )?.severity,
  ).toBe('info');
  b.invoices[0]!.lines = [line({ taxCategory: '电子元件' })];
  expect(checkBatch(b, config()).findings.find((f) => f.ruleId === 'F5')?.severity).toBe('error');
});
it('L6 同名同金额版本优先通过，合计一次，版本状态保留', () => {
  const scan = laborScan();
  const correct = scan.statements[0]!;
  correct.modifiedAt = 1;
  scan.statements.push({
    ...structuredClone(correct),
    path: scan.dir + '/错误说明.docx',
    relativePath: '错误说明.docx',
    modifiedAt: 2,
    parsed: { ...correct.parsed, mode: null, dates: [] },
  });
  const report = checkLabor(scan, config());
  expect(report.total).toBe(2200);
  expect(report.payoutCount).toBe(1);
  expect(report.versionGroups[0]?.selectedFile).toBe('说明.docx');
  expect(
    report.entries.every((e) =>
      e.findings.some((f) => f.ruleId === 'L6' && f.severity === 'warning'),
    ),
  ).toBe(true);
  expect(report.entries[0]?.otherVersions).toEqual(['错误说明.docx']);
  expect(checkLabor(scan, loadConfig({ ruleOptions: { L6: { enabled: false } } })).total).toBe(
    4400,
  );
});
it('L6 日期重叠也分组；没有姓名或日期/金额均不同不合并；都未通过取最新', () => {
  const scan = laborScan({ mode: null });
  scan.statements[0]!.modifiedAt = 1;
  scan.statements.push({
    ...structuredClone(scan.statements[0]!),
    path: scan.dir + '/另版.docx',
    relativePath: '另版.docx',
    modifiedAt: 2,
    parsed: { ...scan.statements[0]!.parsed, total: 2000 },
  });
  let report = checkLabor(scan, config());
  expect(report.total).toBe(2000);
  expect(report.versionGroups[0]?.selectedFile).toBe('另版.docx');
  scan.statements[1]!.parsed.dates = [{ date: '2026-12-01', precision: 'day' }];
  report = checkLabor(scan, config());
  expect(report.payoutCount).toBe(2);
  scan.statements[1]!.parsed.name = null;
  expect(checkLabor(scan, config()).versionGroups).toEqual([]);
});
