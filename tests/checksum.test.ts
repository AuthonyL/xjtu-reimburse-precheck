import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/core/rules/config.js';
import { checkBatch } from '../src/core/rules/engine.js';
import { scanBatch } from '../src/core/scan.js';
import { batch, invoice } from './helpers.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const hashed = (number: string, path: string, sha256 = 'same-file-content') =>
  invoice({
    number,
    sources: [{ path, relativePath: path.split('/').at(-1)!, format: 'pdf', sha256 }],
  });
const duplicates = (result: ReturnType<typeof checkBatch>) =>
  result.findings.filter((finding) => finding.ruleId === 'dup');

it('默认关闭 checksum 去重，内容相同但号码不同不报重复', () => {
  const current = batch([
    hashed('SYNTH-A', '/synthetic/a.pdf'),
    hashed('SYNTH-B', '/synthetic/b.pdf'),
  ]);
  expect(duplicates(checkBatch(current))).toEqual([]);
});

it('开启 checksum 后同批不同号码的相同内容报重复，缺少哈希不匹配', () => {
  const current = batch([
    hashed('SYNTH-A', '/synthetic/a.pdf'),
    hashed('SYNTH-B', '/synthetic/b.pdf'),
    invoice({ number: 'SYNTH-C' }),
  ]);
  const found = duplicates(checkBatch(current, loadConfig({ dupChecksum: true })));
  expect(found.flatMap((finding) => finding.invoiceNumbers).sort()).toEqual(['SYNTH-A', 'SYNTH-B']);
});

it('开启 checksum 后跨批不同号码的相同内容报重复', () => {
  const current = batch([hashed('SYNTH-A', '/synthetic/a.pdf')]);
  const other = { ...batch([hashed('SYNTH-B', '/other/b.pdf')]), id: '20260103', dir: '/other' };
  expect(
    duplicates(checkBatch(current, loadConfig({ dupChecksum: true }), { otherBatches: [other] })),
  ).toHaveLength(1);
});

it('checksum 不重复报告已有的同号跨批重复', () => {
  const current = batch([hashed('SYNTH-A', '/synthetic/a.pdf')]);
  const other = { ...batch([hashed('SYNTH-A', '/other/a.pdf')]), id: '20260103', dir: '/other' };
  expect(
    duplicates(checkBatch(current, loadConfig({ dupChecksum: true }), { otherBatches: [other] })),
  ).toHaveLength(1);
});

it('扫描发票来源和手填来源时记录原始文件内容 sha256', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-checksum-'));
  dirs.push(dir);
  const xml =
    '<EInvoice><EInvoiceData><SellerInformation><SellerName>合成公司</SellerName></SellerInformation><BuyerInformation><BuyerName>合成大学</BuyerName></BuyerInformation><BasicInformation><TotalTax-includedAmount>10</TotalTax-includedAmount></BasicInformation></EInvoiceData><TaxSupervisionInfo><InvoiceNumber>SYNTH-HASH</InvoiceNumber><IssueTime>2026-01-01</IssueTime></TaxSupervisionInfo></EInvoice>';
  await writeFile(join(dir, 'invoice.xml'), xml);
  await writeFile(join(dir, 'receipt.png'), 'synthetic receipt bytes');
  await mkdir(join(dir, '_预检'));
  await writeFile(
    join(dir, '_预检/manual.json'),
    JSON.stringify({
      version: 1,
      entries: [
        { sourceFile: 'receipt.png', currency: 'USD', amount: 10, paymentDate: '2026-01-01' },
      ],
    }),
  );
  const scanned = await scanBatch(dir);
  expect(scanned.invoices.find((item) => item.number === 'SYNTH-HASH')?.sources[0]?.sha256).toBe(
    createHash('sha256').update(xml).digest('hex'),
  );
  expect(scanned.invoices.find((item) => item.kind === 'manual')?.sources[0]?.sha256).toBe(
    '4113fa63b9f6a80f2f1b5f1d9458f3e1e04eede1888bbf8d126555fb4f542cab',
  );
});
