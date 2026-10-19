import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Invoice } from '../types.js';
import { finishLine, normalizeDate, numeric, source, validateInvoice } from './common.js';

type XmlObject = Record<string, unknown>;
const object = (v: unknown): XmlObject => (v && typeof v === 'object' ? (v as XmlObject) : {});
const str = (o: XmlObject, key: string): string => String(o[key] ?? '');
export function parseInvoiceXml(text: string, path: string): Invoice | null {
  if (XMLValidator.validate(text) !== true) throw new Error('XML 格式不合法');
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    removeNSPrefix: true,
    processEntities: false,
  }).parse(text);
  const root = object(object(parsed).EInvoice);
  const data = object(root.EInvoiceData);
  const supervision = object(root.TaxSupervisionInfo);
  if (!Object.keys(data).length) return null;
  const basic = object(data.BasicInformation);
  const seller = object(data.SellerInformation);
  const buyer = object(data.BuyerInformation);
  const number = str(supervision, 'InvoiceNumber');
  const total = numeric(basic['TotalTax-includedAmount']);
  if (!number || total === null) throw new Error('XML 缺少发票号码或价税合计');
  const raw = data.IssuItemInformation;
  const lines = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((v: unknown) => {
    const l = object(v);
    const rate = str(l, 'TaxRate');
    return finishLine({
      name: str(l, 'ItemName'),
      specification: str(l, 'SpecMod'),
      unit: str(l, 'MeaUnits'),
      quantity: numeric(l.Quantity),
      unitPrice: numeric(l.UnPrice),
      amount: numeric(l.Amount),
      taxRate: rate.endsWith('%') ? (numeric(rate.slice(0, -1)) ?? 0) / 100 : numeric(rate),
      tax: /免税|不征税/.test(rate) && !str(l, 'ComTaxAm') ? 0 : numeric(l.ComTaxAm),
    });
  });
  return validateInvoice({
    number,
    kind: 'domestic',
    invoiceType: 'digital',
    date: normalizeDate(str(supervision, 'IssueTime') || str(basic, 'RequestTime')),
    buyer: { name: str(buyer, 'BuyerName'), taxId: str(buyer, 'BuyerIdNum') },
    seller: { name: str(seller, 'SellerName'), taxId: str(seller, 'SellerIdNum') },
    lines,
    total,
    currency: 'CNY',
    sources: [source(path, 'xml')],
    warnings: [],
    remarks: str(object(data.AdditionalInformation), 'Remark'),
  });
}
