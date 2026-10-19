import { readFile } from 'node:fs/promises';
import { extname, basename } from 'node:path';
import { extractPdfTextItems, invoiceFromTextItems, textFromItems } from '../../core/parse/pdf.js';
import { parseInvoiceXml } from '../../core/parse/xml.js';
import { parseForeignText } from '../../core/parse/foreign.js';
import { parseOfd } from '../../core/parse/ofd.js';
import { extractDocxText } from '../../core/labor/scan.js';
import { parseLaborText } from '../../core/labor/parse.js';
import { identifyAttachment } from '../../core/attachments.js';
import type { RuleConfig } from '../../core/rules/config.js';
import type { Invoice } from '../../core/types.js';
import type { LaborFields } from '../../core/labor/types.js';
export const CORRECTION_EXTENSIONS = [
  'pdf',
  'xml',
  'ofd',
  'docx',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'heic',
  'tif',
  'tiff',
  'bmp',
];
export async function identifyCorrectionFile(
  file: string,
  originalName: string,
  config: RuleConfig,
) {
  let invoice: Invoice | null = null;
  let labor: LaborFields | null = null;
  let text = '';
  let parseError = '';
  const extension = extname(file).toLowerCase();
  try {
    if (extension === '.pdf') {
      const items = await extractPdfTextItems(file);
      text = textFromItems(items);
      invoice = invoiceFromTextItems(items, file) ?? parseForeignText(text, file);
    }
    if (extension === '.xml') invoice = parseInvoiceXml(await readFile(file, 'utf8'), file);
    if (extension === '.ofd') invoice = (await parseOfd(file, file)).invoice;
    if (extension === '.docx') text = await extractDocxText(await readFile(file));
    if (
      !invoice &&
      text.trim() &&
      config.labor.statementKeywords.some((k) =>
        (text.replace(/\s/g, '') + basename(originalName)).includes(k),
      )
    )
      labor = parseLaborText(text, config);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  return { invoice, labor, attachmentType: identifyAttachment(originalName, config), parseError };
}
