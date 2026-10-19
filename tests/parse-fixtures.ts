import type { PdfTextItem } from '../src/core/parse/pdf.js';

export const xml = `<EInvoice><EInvoiceData>
<SellerInformation><SellerName>合成器件公司</SellerName><SellerIdNum>SYNTHSELLER0000001</SellerIdNum></SellerInformation>
<BuyerInformation><BuyerName>合成大学</BuyerName><BuyerIdNum>SYNTHBUYER00000001</BuyerIdNum></BuyerInformation>
<BasicInformation><TotalTax-includedAmount>226.00</TotalTax-includedAmount></BasicInformation>
<IssuItemInformation><ItemName>*电子元件*连接头</ItemName><SpecMod>A1</SpecMod><MeaUnits>个</MeaUnits><Quantity>2</Quantity><UnPrice>50</UnPrice><Amount>100</Amount><TaxRate>0.13</TaxRate><ComTaxAm>13</ComTaxAm></IssuItemInformation>
<IssuItemInformation><ItemName>*电子元件*电路板</ItemName><Quantity>1</Quantity><Amount>100</Amount><TaxRate>0.13</TaxRate><ComTaxAm>13</ComTaxAm></IssuItemInformation>
</EInvoiceData><TaxSupervisionInfo><InvoiceNumber>SYNTH-001</InvoiceNumber><IssueTime>2026-01-02</IssueTime></TaxSupervisionInfo></EInvoice>`;

export function item(str: string, x: number, y: number): PdfTextItem {
  return { str, x, y, width: str.length * 5, height: 10, page: 1 };
}
export const row = (y: number, cells: string[]) =>
  cells.flatMap((s, n) => (s ? [item(s, [20, 140, 230, 280, 340, 420, 490, 560][n]!, y)] : []));
export function pdfItems(total = '113.00'): PdfTextItem[] {
  return [
    item('电子发票（普通发票）', 100, 20),
    item('发票号码：SYNTH-PDF', 400, 20),
    item('开票日期：2026年01月02日', 400, 40),
    item('名称：合成大学', 30, 70),
    item('名称：合成公司', 330, 70),
    item('统一社会信用代码/纳税人识别号：SYNTHBUYER00000001', 30, 95),
    item('统一社会信用代码/纳税人识别号：SYNTHSELLER0000001', 330, 95),
    ...row(120, ['项目名称', '规格型号', '单位', '数量', '单价', '金额', '税率/征收率', '税额']),
    ...row(140, ['*电子元件*超长', 'M-1', '个', '2', '50.00', '100.00', '13%', '13.00']),
    ...row(154, ['连接线']),
    item('合计', 20, 180),
    item(`价税合计（小写）¥${total}`, 20, 200),
    item('备注：合成备注', 20, 220),
  ];
}
