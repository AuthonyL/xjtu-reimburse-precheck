import type { Invoice } from '../types.js';
import { normalizeDate, numeric, source } from './common.js';
import { extractPdfTextItems, textFromItems } from './pdf.js';

function paymentDate(text: string): string {
  const labelled =
    text.match(/(?:Date paid|paid on|Receipt Date|付款日期|付日期)\s*[:：]?\s*([^\n]+)/i)?.[1] ??
    '';
  const normalized = normalizeDate(labelled);
  if (normalized) return normalized;
  const english = labelled.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!english) return '';
  const month =
    [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ].indexOf(english[1]!.toLowerCase()) + 1;
  return month
    ? `${english[3]}-${String(month).padStart(2, '0')}-${english[2]!.padStart(2, '0')}`
    : '';
}
export function parseForeignText(text: string, path: string): Invoice | null {
  const damaged = text.includes('\0');
  text = text
    .normalize('NFKC')
    .replace(/([A-Z0-9]+)[ \t]*\0[ \t]*([A-Z0-9]+)/g, '$1-$2')
    .replace(/\0[ \t]*/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, '');
  const partialReceipt =
    /账单编/.test(text) &&
    /cancel your subscription/i.test(text) &&
    /付额\s*(?:US\$|[\$€£])/.test(text);
  if (!/\breceipt\b|收据/i.test(text) && !partialReceipt) return null;
  const explicitCurrency = text.match(
    /(?<![A-Z0-9-])(USD|EUR|GBP|CAD|AUD|SGD|HKD|JPY|CHF|CNY|KRW)(?![A-Z0-9-])/,
  )?.[1];
  const currency =
    explicitCurrency ??
    (/US\$|(?<![A-Z])\$/.test(text) ? 'USD' : /€/.test(text) ? 'EUR' : /£/.test(text) ? 'GBP' : '');
  if (!currency) return null;
  const amountLine = [
    ...text.matchAll(
      /(?:Amount paid|Total|支付额|付额|合计)\s*[:：]?\s*(?:US\$|[\$€£]|USD|EUR|GBP)?\s*([\d,]+\.\d{2})/gi,
    ),
  ].at(-1);
  const fallback = text.match(/(?:US\$|[\$€£])\s*([\d,]+\.\d{2})\s*paid on/i);
  const total = numeric(amountLine?.[1] ?? fallback?.[1]);
  if (total === null) return null;
  const receiptTable = text.match(
    /Receipt number[^\n]*\n[^\n]*?[ \t]([A-Z0-9]+-[A-Z0-9]+)[ \t]*(?:\n|$)/i,
  )?.[1];
  const directReceipt =
    receiptTable ??
    text.match(
      /(?:Receipt No\.?[ \t]*#?|Receipt number|收据编号)[ \t]*[:：]?[ \t]*([A-Z0-9]+(?:-[A-Z0-9]+)+|[A-Z0-9]{6,})/i,
    )?.[1];
  const number =
    directReceipt ??
    text.match(/(?:Invoice number|账单编号|账单编)\s*[:：]?\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)/i)?.[1];
  if (!number) return null;
  const date = paymentDate(text);
  const warnings: string[] = [];
  if (damaged) warnings.push('部分字形无法提取，已按可读账单号、支付日和支付额识别，请核对原件');
  if (!date) warnings.push('未能读取支付日期，请手填金额和支付日期');
  const seller =
    text
      .split('\n')
      .map((s) => s.trim())
      .find((s) => /(?:Inc\.|Ltd\.|LLC)/i.test(s))
      ?.match(/^.*?(?:Inc\.|Ltd\.|LLC)/i)?.[0] ??
    text.match(/\b(Cursor|OpenAI|Windsurf|Trae)\b/i)?.[1] ??
    '海外商家（请核对）';
  return {
    number,
    kind: 'foreign',
    invoiceType: 'foreign',
    date,
    buyer: { name: '', taxId: '' },
    seller: { name: seller, taxId: '' },
    lines: [],
    total,
    currency,
    sources: [source(path, 'pdf')],
    warnings,
  };
}
export async function parseForeignPdf(path: string): Promise<Invoice | null> {
  return parseForeignText(textFromItems(await extractPdfTextItems(path)), path);
}
