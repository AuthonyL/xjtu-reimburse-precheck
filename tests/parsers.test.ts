import { describe, expect, it } from 'vitest';
import { parseInvoiceXml } from '../src/core/parse/xml.js';
import { invoiceFromTextItems, type PdfTextItem } from '../src/core/parse/pdf.js';
import { parseForeignText } from '../src/core/parse/foreign.js';
import { parseOfd } from '../src/core/parse/ofd.js';
import JSZip from 'jszip';

import { xml, item, row, pdfItems } from './parse-fixtures.js';

describe('合成发票解析', () => {
  it('保留号码文本、多明细、税目和含税单价', () => {
    const v = parseInvoiceXml(xml, '/synthetic/a.xml')!;
    expect(v.number).toBe('SYNTH-001');
    expect(v.date).toBe('2026-01-02');
    expect(v.lines).toHaveLength(2);
    expect(v.lines[0]).toMatchObject({
      name: '*电子元件*连接头',
      taxCategory: '电子元件',
      grossUnitPrice: 56.5,
      taxRate: 0.13,
    });
    expect(v.total).toBe(226);
    expect(v.warnings).toEqual([]);
  });
  it('拒绝损坏 XML 和非发票 XML', () => {
    expect(() => parseInvoiceXml('<EInvoice><x></EInvoice>', 'a.xml')).toThrow();
    expect(parseInvoiceXml('<Document/>', 'a.xml')).toBeNull();
  });
  it('坐标恢复明细续行、双方名称、合计及备注', () => {
    const v = invoiceFromTextItems(pdfItems(), 'a.pdf')!;
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0]!.name).toBe('*电子元件*超长连接线');
    expect(v.buyer.name).toBe('合成大学');
    expect(v.seller.taxId).toBe('SYNTHSELLER0000001');
    expect(v.lines[0]!.grossUnitPrice).toBe(56.5);
    expect(v.total).toBe(113);
    expect(v.remarks).toContain('合成备注');
  });
  it('金额不平或缺列不能静默成功', () => {
    expect(invoiceFromTextItems(pdfItems('114.00'), 'a.pdf')!.warnings.join()).toContain('合计');
    const v = invoiceFromTextItems(
      pdfItems().filter((i) => i.str !== '13.00'),
      'a.pdf',
    )!;
    expect(v.warnings.join()).toContain('税额');
  });
  it('非发票和只有号码的运单不冒充发票', () => {
    expect(invoiceFromTextItems([item('发票号码：SYNTH-PDF', 20, 20)], 'a.pdf')).toBeNull();
  });
  it('合计标签与金额的基线错位时不会把汇总行当明细', () => {
    const items = pdfItems().filter((i) => i.str !== '合计');
    items.push(
      item('合', 20, 185),
      item('计', 50, 185),
      item('100.00', 420, 180),
      item('13.00', 560, 180),
    );
    const v = invoiceFromTextItems(items, 'a.pdf')!;
    expect(v.lines).toHaveLength(1);
    expect(v.warnings).toEqual([]);
  });
  it('数量与长单价合为一个文字项时仍按列切分', () => {
    const items = pdfItems().filter((i) => !(i.y === 140 && ['2', '50.00'].includes(i.str)));
    items.push({ ...item('2 50.00', 280, 140), width: 80 });
    expect(invoiceFromTextItems(items, 'a.pdf')!.lines[0]).toMatchObject({
      quantity: 2,
      unitPrice: 50,
    });
  });
  it('兼容 Unicode 康熙部首形式的电子发票标题', () => {
    expect(
      invoiceFromTextItems(
        pdfItems().map((i) => ({ ...i, str: i.str.replace('电子', '电⼦') })),
        'a.pdf',
      ),
    ).not.toBeNull();
  });
  it('品名先换行再出现数值时仍是一行服务，续行不能丢税目', () => {
    const items = pdfItems().filter((i) => i.y !== 140 && i.y !== 154);
    items.push(
      item('*信息技术服务*', 20, 140),
      ...row(154, ['定制开发', '', '次', '1', '100', '100', '13%', '13']),
    );
    const v = invoiceFromTextItems(items, 'a.pdf')!;
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0]).toMatchObject({
      name: '*信息技术服务*定制开发',
      taxCategory: '信息技术服务',
      quantity: 1,
    });
    expect(v.warnings).toEqual([]);
  });
  it('多页重复抬头、页脚不会进入明细', () => {
    const page1 = pdfItems('226.00').filter((i) => i.y < 180);
    page1.push(item('第1页/共2页', 280, 240));
    const page2 = pdfItems('226.00').map((i) => ({ ...i, page: 2 }));
    const v = invoiceFromTextItems([...page1, ...page2], 'a.pdf')!;
    expect(v.lines).toHaveLength(2);
    expect(
      v.lines.every((l) => l.name === '*电子元件*超长连接线' && l.specification === 'M-1'),
    ).toBe(true);
    expect(v.warnings).toEqual([]);
  });
  it('品名和型号的内部空格原样保留，税目前缀不丢失', () => {
    const items = pdfItems()
      .map((i) => ({
        ...i,
        str:
          i.str === '*电子元件*超长'
            ? '*电子元件*Ultra Cable'
            : i.str === 'M-1'
              ? 'Model A'
              : i.str,
      }))
      .filter((i) => i.y !== 154);
    const v = invoiceFromTextItems(items, 'a.pdf')!;
    expect(v.lines[0]!.name).toBe('*电子元件*Ultra Cable');
    expect(v.lines[0]!.specification).toBe('Model A');
  });
  it('英文收据提取商家、支付日、金额和收据号', () => {
    const v = parseForeignText(
      'Receipt\nInvoice number SYNTH-INV\nDate paid December 14, 2025\nExample Software, Inc.\n$20.00 paid on December 14, 2025\nAmount paid $20.00\nReceipt number SYNTH-R1',
      'receipt.pdf',
    )!;
    expect(v).toMatchObject({
      number: 'SYNTH-R1',
      date: '2025-12-14',
      currency: 'USD',
      total: 20,
      seller: { name: 'Example Software, Inc.' },
    });
  });
  it('明确币种代码优先于美元符号，不能把 CAD 当 USD', () => {
    expect(
      parseForeignText(
        'Receipt\nInvoice number SYNTH-USD\nDate paid 2026-01-01\nSynthetic, Inc.\nCurrency CAD\nAmount paid $25.00',
        'r.pdf',
      ),
    ).toMatchObject({ currency: 'CAD', total: 25 });
  });
  it('中文收据与带币种的 Receipt Date 收据', () => {
    expect(
      parseForeignText(
        '收据\n账单编号 SYNTH-2\n付款日期 2026年1月1日\nExample, Inc.\n支付额 US$15.00',
        'r.pdf',
      ),
    ).toMatchObject({ currency: 'USD', total: 15, date: '2026-01-01' });
    expect(
      parseForeignText(
        'Spring Example Ltd.\nRECEIPT\nReceipt No. # SYNTH-3\nReceipt Date: 2025-10-26\nTotal: 10.00 USD',
        'r.pdf',
      ),
    ).toMatchObject({ number: 'SYNTH-3', total: 10 });
    expect(parseForeignText('a random document $100', 'r.pdf')).toBeNull();
  });
  it('海外收据缺损字形有可验证账单号、付款日和支付额时保留告警', () => {
    const v = parseForeignText(
      '\0据\n账单编\0 SYNTHX \0 0001\n付\0⽇期 2026 年 1 ⽉ 1 ⽇\nSynthetic Software, Inc.\n\0付额 US$15.00\nVisit https://example.invalid to cancel your subscription.',
      'r.pdf',
    );
    expect(v).toMatchObject({ number: 'SYNTHX-0001', date: '2026-01-01', total: 15 });
    expect(v!.warnings.join()).toContain('字形');
  });
  it('收据号表头不会把下一行的支付方式读成号码，空字形不吞换行', () => {
    const v = parseForeignText(
      'Receipt\nInvoice number SYNTHX-0001\nDate paid December 14, 2025\nSynthetic Software, Inc.\0\n900 Sample Street\nTotal $20.00\nPayment method Date Amount paid Receipt number\nMastercard - 1111 December 14, 2025 $20.00 4444 \0 5555',
      'r.pdf',
    )!;
    expect(v.number).toBe('4444-5555');
    expect(v.seller.name).toBe('Synthetic Software, Inc.');
    expect(
      parseForeignText(
        '\0据\n账 单 编\0 SYNTHX \0 0001\n付 \0 ⽇ 期 2026 年 1 ⽉ 1 ⽇\nSynthetic Software, Inc.\n\0付额 US$15.00\nVisit https://example.invalid to cancel your subscription.',
        'r.pdf',
      )!.date,
    ).toBe('2026-01-01');
  });
  it('OFD 从 ZIP 中找 EInvoice XML，无 XML 返回警告', async () => {
    const zip = new JSZip();
    zip.file('Doc/Attach/invoice.xml', xml);
    expect(
      (await parseOfd(await zip.generateAsync({ type: 'uint8array' }), 'a.ofd')).invoice?.total,
    ).toBe(226);
    const empty = new JSZip();
    empty.file('OFD.xml', '<OFD/>');
    expect(
      (await parseOfd(await empty.generateAsync({ type: 'uint8array' }), 'b.ofd')).warning,
    ).toContain('请提供 PDF 或 XML 版');
  });
});
