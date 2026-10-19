import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanBatch } from '../src/core/scan.js';
import { identifyAttachment } from '../src/core/attachments.js';
import { loadConfig } from '../src/core/rules/config.js';
import { checkBatch } from '../src/core/rules/engine.js';
import JSZip from 'jszip';

const xml = [
  '<EInvoice>',
  '<EInvoiceData>',
  '<SellerInformation>',
  '<SellerName>合成公司',
  '</SellerName>',
  '</SellerInformation>',
  '<BuyerInformation>',
  '<BuyerName>合成大学',
  '</BuyerName>',
  '</BuyerInformation>',
  '<BasicInformation>',
  '<TotalTax-includedAmount>10',
  '</TotalTax-includedAmount>',
  '</BasicInformation>',
  '<IssuItemInformation>',
  '<ItemName>合成器件',
  '</ItemName>',
  '<Quantity>1',
  '</Quantity>',
  '<Amount>10',
  '</Amount>',
  '<ComTaxAm>0',
  '</ComTaxAm>',
  '</IssuItemInformation>',
  '</EInvoiceData>',
  '<TaxSupervisionInfo>',
  '<InvoiceNumber>SYNTH-SCAN',
  '</InvoiceNumber>',
  '<IssueTime>2026-01-01',
  '</IssueTime>',
  '</TaxSupervisionInfo>',
  '</EInvoice>',
].join('');
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
it('扫描合并同号来源，保留重复证据，跳过输出、二进制和符号链接', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-test-'));
  dirs.push(dir);
  await mkdir(join(dir, '_预检'));
  await mkdir(join(dir, '公转'));
  await Promise.all([
    writeFile(join(dir, 'a.xml'), xml),
    writeFile(join(dir, '公转/b.xml'), xml),
    writeFile(join(dir, '_预检/hidden.xml'), xml),
    writeFile(join(dir, 'x.dll'), ''),
    writeFile(join(dir, 'x.ini'), ''),
    writeFile(join(dir, '.DS_Store'), ''),
    writeFile(join(dir, '店铺.jpg'), ''),
    writeFile(join(dir, '未知.pdf'), 'not a pdf'),
  ]);
  if (process.platform === 'win32')
    await symlink(join(dir, '公转'), join(dir, 'link.xml'), 'junction');
  else await symlink(join(dir, 'a.xml'), join(dir, 'link.xml'), 'file');
  const v = await scanBatch(dir);
  expect(v.invoices).toHaveLength(1);
  expect(v.invoices[0]!.sources).toHaveLength(2);
  expect(v.attachments[0]!.type).toBe('store');
  expect(v.unidentified).toHaveLength(1);
  expect(JSON.stringify(v)).not.toMatch(/x\.dll|x\.ini|hidden\.xml|link\.xml|DS_Store/);
  expect(v.diagnostics.some((f) => f.ruleId === 'parse')).toBe(true);
});
it('附件识别可配置，并识别学校报销单', () => {
  const c = loadConfig({ attachmentKeywords: { store: ['商户证明'] } });
  expect(identifyAttachment('商户证明.png', c)).toBe('store');
  expect(identifyAttachment('03209999999999报销单.pdf', c)).toBe('schoolForm');
  expect(identifyAttachment('维修清单.pdf', c)).toBe('repairList');
  expect(identifyAttachment('订阅Plan.jpg', c)).toBe('subscription');
});
it('手填金额、日期、汇率验证，忽略 manual.json 以外的输出', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-manual-'));
  dirs.push(dir);
  await mkdir(join(dir, '_预检'));
  await mkdir(join(dir, 'AI'));
  await writeFile(join(dir, 'AI/收据.png'), '');
  await writeFile(
    join(dir, '_预检/manual.json'),
    JSON.stringify({
      version: 1,
      entries: [
        {
          sourceFile: 'AI/收据.png',
          currency: 'USD',
          amount: 20,
          paymentDate: '2026-01-01',
          exchangeRate: 700,
          rateBase: 100,
        },
      ],
    }),
  );
  expect((await scanBatch(dir)).invoices[0]).toMatchObject({
    kind: 'manual',
    total: 20,
    currency: 'USD',
    date: '2026-01-01',
  });
  await writeFile(join(dir, '_预检/manual.json'), '{broken');
  expect((await scanBatch(dir)).diagnostics.some((f) => f.ruleId === 'manual')).toBe(true);
});
it('合法发票即使文件名含附件关键词也应先解析', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-name-'));
  dirs.push(dir);
  await writeFile(join(dir, '订阅发票.xml'), xml);
  const b = await scanBatch(dir);
  expect(b.invoices).toHaveLength(1);
  expect(b.attachments).toHaveLength(0);
});
it('类型目录里的泛名附件可找到，目录继承不能吞掉发票', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-material-dir-'));
  dirs.push(dir);
  await mkdir(join(dir, '支付记录/扫描'), { recursive: true });
  await mkdir(join(dir, '业务'));
  await writeFile(join(dir, '支付记录/扫描/01.jpg'), '');
  await writeFile(
    join(dir, '支付记录/发票.xml'),
    xml.replace('<TotalTax-includedAmount>10', '<TotalTax-includedAmount>1000'),
  );
  const b = await scanBatch(dir);
  const r = checkBatch(b);
  expect(b.invoices).toHaveLength(1);
  expect(b.attachments[0]!.type).toBe('payment');
  const requirement = r.groups
    .find((g) => g.invoices.length)!
    .requirements.find((r) => r.type === 'payment')!;
  expect(requirement.status).toBe('found');
  expect(requirement.note).toContain('在批次根目录找到，请确认对应');
});
it('XML 比 OFD 优先，金额和日期也必须一起合并', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-merge-'));
  dirs.push(dir);
  const zip = new JSZip();
  zip.file(
    'invoice.xml',
    xml
      .replace('<TotalTax-includedAmount>10', '<TotalTax-includedAmount>400')
      .replace('<IssueTime>2026-01-01</IssueTime>', ''),
  );
  await writeFile(join(dir, 'a.ofd'), await zip.generateAsync({ type: 'uint8array' }));
  await writeFile(
    join(dir, 'a.xml'),
    xml
      .replace('<TotalTax-includedAmount>10', '<TotalTax-includedAmount>600')
      .replace('<Amount>10', '<Amount>600'),
  );
  const b = await scanBatch(dir);
  expect(b.invoices[0]).toMatchObject({ total: 600, date: '2026-01-01' });
  expect(b.invoices[0]!.sources).toHaveLength(2);
  expect(checkBatch(b).groups[0]!.requirements.some((r) => r.type === 'inventory')).toBe(true);
  expect(b.invoices[0]!.warnings.join()).toContain('不一致');
});
it('同号手填多个来源不覆盖首条金额，保留重复来源并报错', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-manual-dup-'));
  dirs.push(dir);
  await mkdir(join(dir, '_预检'));
  await mkdir(join(dir, 'AI'));
  await writeFile(join(dir, 'AI/a.png'), '');
  await writeFile(join(dir, 'AI/b.png'), '');
  await writeFile(
    join(dir, '_预检/manual.json'),
    JSON.stringify({
      version: 1,
      entries: [
        {
          sourceFile: 'AI/a.png',
          number: 'SYNTH-MANUAL',
          currency: 'USD',
          amount: 20,
          paymentDate: '2026-01-01',
          exchangeRate: 7,
        },
        {
          sourceFile: 'AI/b.png',
          number: 'SYNTH-MANUAL',
          currency: 'USD',
          amount: 30,
          paymentDate: '2026-01-01',
          exchangeRate: 8,
        },
      ],
    }),
  );
  const b = await scanBatch(dir);
  const r = checkBatch(b);
  expect(b.invoices).toHaveLength(1);
  expect(b.invoices[0]!.sources).toHaveLength(2);
  expect(b.invoices[0]!.total).toBe(20);
  expect(r.findings.some((f) => f.ruleId === 'dup' && f.severity === 'error')).toBe(true);
  expect(r.groups[0]!.invoices[0]!.cnyAmount).toBe(140);
});
it('手填来源路径规范化后汇率仍能关联', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-canonical-'));
  dirs.push(dir);
  await mkdir(join(dir, '_预检'));
  await mkdir(join(dir, 'AI'));
  await writeFile(join(dir, 'AI/a.png'), '');
  await writeFile(
    join(dir, '_预检/manual.json'),
    JSON.stringify({
      version: 1,
      entries: [
        {
          sourceFile: 'AI/./a.png',
          currency: 'USD',
          amount: 20,
          paymentDate: '2026-01-01',
          exchangeRate: 7,
        },
      ],
    }),
  );
  const b = await scanBatch(dir);
  expect(b.manual.entries[0]!.sourceFile).toBe('AI/a.png');
  expect(checkBatch(b).groups[0]!.invoices[0]!.cnyAmount).toBe(140);
});
