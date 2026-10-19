import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import type { Invoice } from '../types.js';
import { parseInvoiceXml } from './xml.js';
import { source } from './common.js';

export async function parseOfd(
  input: Uint8Array | string,
  path: string,
): Promise<{ invoice: Invoice | null; warning?: string }> {
  try {
    const zip = await JSZip.loadAsync(typeof input === 'string' ? await readFile(input) : input);
    for (const file of Object.values(zip.files).filter((f) => !f.dir && /\.xml$/i.test(f.name))) {
      const text = await file.async('string');
      if (!/<(?:\w+:)?EInvoice[\s>]/.test(text)) continue;
      const invoice = parseInvoiceXml(text, path);
      if (invoice) {
        invoice.sources = [source(path, 'ofd')];
        return { invoice };
      }
    }
  } catch {
    /* 无嵌入发票 XML 时保留来源供扫描层匹配。 */
  }
  return { invoice: null, warning: 'OFD 无法读取发票 XML，请提供 PDF 或 XML 版' };
}
