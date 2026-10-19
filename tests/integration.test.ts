import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { buildReport, checkBatch, checkRoot, loadConfig, scanBatch } from '../src/core/index.js';
import { syntheticPdf } from './pdf-fixture.js';

const xml = [
  '<EInvoice>',
  '<EInvoiceData>',
  '<SellerInformation>',
  '<SellerName>合成公司',
  '</SellerName>',
  '<SellerIdNum>SYNTHSELLER0000001',
  '</SellerIdNum>',
  '</SellerInformation>',
  '<BuyerInformation>',
  '<BuyerName>合成大学',
  '</BuyerName>',
  '<BuyerIdNum>SYNTHBUYER00000001',
  '</BuyerIdNum>',
  '</BuyerInformation>',
  '<BasicInformation>',
  '<TotalTax-includedAmount>113',
  '</TotalTax-includedAmount>',
  '</BasicInformation>',
  '<IssuItemInformation>',
  '<ItemName>*电子元件*合成器件',
  '</ItemName>',
  '<SpecMod>Model A',
  '</SpecMod>',
  '<MeaUnits>个',
  '</MeaUnits>',
  '<Quantity>2',
  '</Quantity>',
  '<UnPrice>50',
  '</UnPrice>',
  '<Amount>100',
  '</Amount>',
  '<TaxRate>0.13',
  '</TaxRate>',
  '<ComTaxAm>13',
  '</ComTaxAm>',
  '</IssuItemInformation>',
  '</EInvoiceData>',
  '<TaxSupervisionInfo>',
  '<InvoiceNumber>SYNTH-INTEGRATION',
  '</InvoiceNumber>',
  '<IssueTime>2026-01-02',
  '</IssueTime>',
  '</TaxSupervisionInfo>',
  '</EInvoice>',
].join('');

it('真实 Node PDF提取 → PDF/XML/OFD同号合并 → 规则 → 报告', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-pdf-pipeline-'));
  try {
    await mkdir(join(dir, '公转'));
    await writeFile(join(dir, '公转/订阅发票.pdf'), syntheticPdf());
    const c = loadConfig({ buyer: { name: '合成大学', taxId: 'SYNTHBUYER00000001' } });
    const pdf = await scanBatch(dir, { config: c });
    expect(pdf.invoices).toHaveLength(1);
    expect(pdf.invoices[0]!.total).toBe(113);
    expect(pdf.invoices[0]!.lines[0]!.grossUnitPrice).toBe(56.5);
    await writeFile(join(dir, '公转/a.xml'), xml);
    const zip = new JSZip();
    zip.file('invoice.xml', xml);
    await writeFile(join(dir, '公转/a.ofd'), await zip.generateAsync({ type: 'uint8array' }));
    const b = await scanBatch(dir, { config: c });
    expect(b.invoices).toHaveLength(1);
    expect(b.invoices[0]!.sources).toHaveLength(3);
    const result = checkBatch(b, c);
    expect(result.findings.some((f) => f.ruleId === 'dup')).toBe(false);
    expect(result.groups[0]!.requirements.some((r) => r.type === 'inventory')).toBe(true);
    const r = buildReport(result);
    expect(r.totalCny).toBe(113);
    expect(r.invoiceCount).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('checkRoot跨批次、学校报销单、历史与拒票比对串联', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-root-pipeline-'));
  try {
    for (const d of ['20260101', '20260102', '无法报销费用/旧票', 'tmp/20260103']) {
      await mkdir(join(dir, d), { recursive: true });
      await writeFile(join(dir, d, 'a.xml'), xml);
    }
    await writeFile(join(dir, '20260101/03209999999999报销单.pdf'), '');
    const root = await checkRoot(dir, loadConfig(), {
      submittedHistory: new Set(['SYNTH-INTEGRATION']),
    });
    expect(root.batches).toHaveLength(2);
    expect(root.rejectedNumbers.has('SYNTH-INTEGRATION')).toBe(true);
    const findings = root.results.find((r) => r.batch.id === '20260102')!.findings;
    expect(
      findings.some((f) => f.ruleId === 'dup' && f.message.includes('已在 20260101 报销')),
    ).toBe(true);
    expect(findings.some((f) => f.message.includes('已提交历史'))).toBe(true);
    expect(findings.some((f) => f.message.includes('曾判为无法报销'))).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
