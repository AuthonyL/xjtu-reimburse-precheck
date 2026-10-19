import type { Invoice, InvoiceLine, SourceFile } from '../types.js';

export const roundMoney = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
export const hasValidTaxIdLength = (taxId: string): boolean =>
  [15, 17, 18, 20].includes(taxId.length);
export function parseWarningCode(message: string): string {
  const row = message.match(/^第(\d+)行(缺少金额|缺少税额|缺少数量|数量为0)/);
  if (row) return `line:${row[1]}:${row[2]}`;
  if (/^明细价税合计.*与票面合计.*不符/.test(message)) return 'line-total-mismatch';
  const taxId = message.match(/^(购买方|销售方)税号长度不合法/);
  if (taxId) return `tax-id-length:${taxId[1]}`;
  return message;
}
export function numeric(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const text = String(v)
    .trim()
    .replace(/[,¥￥$\s]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
export function taxCategory(name: string): string {
  return (
    name
      .match(/^\*([^*]+)\*/)?.[1]
      ?.normalize('NFKC')
      .replace(/\s/g, '') ?? ''
  );
}
export function source(path: string, format: SourceFile['format']): SourceFile {
  return { path, relativePath: path, format };
}
export function finishLine(line: Omit<InvoiceLine, 'grossUnitPrice' | 'taxCategory'>): InvoiceLine {
  return {
    ...line,
    taxCategory: taxCategory(line.name),
    ...(line.quantity === null &&
    line.unitPrice === null &&
    line.amount !== null &&
    line.amount < 0 &&
    line.tax !== null &&
    line.tax <= 0
      ? { discount: true }
      : {}),
    grossUnitPrice:
      !line.discount && line.quantity && line.amount !== null && line.tax !== null
        ? (line.amount + line.tax) / line.quantity
        : null,
  };
}
export function validateInvoice(invoice: Invoice): Invoice {
  if (invoice.kind === 'domestic') {
    for (const [key, label] of [
      ['buyer', '购买方'],
      ['seller', '销售方'],
    ] as const) {
      if (!hasValidTaxIdLength(invoice[key].taxId))
        invoice.warnings.push(
          `${label}税号长度不合法（${invoice[key].taxId.length}位），可能读取不完整，请人工核对；合法长度为15、17、18、20位`,
        );
    }
  }
  if (!invoice.lines.length) invoice.warnings.push('未能读取发票明细，请人工核对');
  invoice.lines.forEach((l, n) => {
    for (const [label, value] of [
      ['金额', l.amount],
      ['税额', l.tax],
      ['数量', l.quantity],
    ] as const) {
      if (value === null && !(l.discount && label === '数量'))
        invoice.warnings.push(`第${n + 1}行缺少${label}，请人工核对`);
    }
    if (l.quantity === 0) invoice.warnings.push(`第${n + 1}行数量为0，含税单价无法计算`);
  });
  if (invoice.lines.length && invoice.lines.every((l) => l.amount !== null && l.tax !== null)) {
    const sum = invoice.lines.reduce((s, l) => s + l.amount! + l.tax!, 0);
    if (Math.abs(roundMoney(sum) - invoice.total) > 0.01 * invoice.lines.length + 1e-8)
      invoice.warnings.push(
        `明细价税合计${roundMoney(sum).toFixed(2)}与票面合计${invoice.total.toFixed(2)}不符`,
      );
  }
  return invoice;
}
export function normalizeDate(v: string): string {
  const m = v.match(/(\d{4})\s*[年\-/]\s*(\d{1,2})\s*[月\-/]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` : '';
}
