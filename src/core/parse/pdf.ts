import defaults from '../rules/defaults.json' with { type: 'json' };
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Invoice, InvoiceLine, InvoiceTrip } from '../types.js';
import { finishLine, normalizeDate, numeric, source, validateInvoice } from './common.js';

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}
interface TextRow {
  page: number;
  y: number;
  items: PdfTextItem[];
}
export function textRows(items: readonly PdfTextItem[]): TextRow[] {
  const rows: TextRow[] = [];
  for (const item of [...items]
    .filter((i) => i.str.trim())
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)) {
    const last = rows.at(-1);
    if (last && last.page === item.page && Math.abs(last.y - item.y) <= 3) last.items.push(item);
    else rows.push({ page: item.page, y: item.y, items: [item] });
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}
export const textFromItems = (items: readonly PdfTextItem[]): string =>
  textRows(items)
    .map((r) => r.items.map((i) => i.str).join(' '))
    .join('\n');

export function pdfResourcePaths(packageFile: string, api: path.PlatformPath = path) {
  const base = api.dirname(packageFile).replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2');
  // pdf.js requires resource directories to end with "/"; Node reads forward-slash paths on Windows too.
  const directory = (name: string) => api.join(base, name).replaceAll('\\', '/') + '/';
  return {
    module: api.join(base, 'legacy/build/pdf.mjs'),
    worker: api.join(base, 'legacy/build/pdf.worker.mjs'),
    cMapUrl: directory('cmaps'),
    standardFontDataUrl: directory('standard_fonts'),
    wasmUrl: directory('wasm'),
  };
}

export function isOptionalCanvasWarning(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    (message.startsWith('Warning: Cannot load "@napi-rs/canvas" package:') ||
      message === 'Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.' ||
      message === 'Warning: Cannot polyfill `Path2D`, rendering may be broken.')
  );
}

let pdfModule: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | undefined;
function loadPdfModule(module: string) {
  return (pdfModule ??= (async () => {
    const warn = console.warn;
    const filtered: typeof console.warn = (...args) => {
      if (!isOptionalCanvasWarning(args[0])) warn(...args);
    };
    // 只在首次导入期间忽略可选绘图 polyfill 提示，文字提取不使用 canvas。
    console.warn = filtered;
    try {
      return (await import(
        pathToFileURL(module).href
      )) as typeof import('pdfjs-dist/legacy/build/pdf.mjs');
    } finally {
      if (console.warn === filtered) console.warn = warn;
    }
  })());
}

export async function extractPdfTextItems(path: string): Promise<PdfTextItem[]> {
  const require = createRequire(import.meta.url);
  const paths = pdfResourcePaths(require.resolve('pdfjs-dist/package.json'));
  const { getDocument, Util, GlobalWorkerOptions } = await loadPdfModule(paths.module);
  GlobalWorkerOptions.workerSrc = pathToFileURL(paths.worker).href;
  const task = getDocument({
    data: new Uint8Array(await readFile(path)),
    cMapUrl: paths.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: paths.standardFontDataUrl,
    wasmUrl: paths.wasmUrl,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const output: PdfTextItem[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const transform = Util.transform(viewport.transform, item.transform);
        output.push({
          str: item.str,
          x: transform[4]!,
          y: transform[5]!,
          width: item.width,
          height: item.height,
          page: pageNumber,
        });
      }
      page.cleanup();
    }
    return output;
  } finally {
    await task.destroy();
  }
}

const compact = (s: string): string => s.normalize('NFKC').replace(/\s+/g, '');
interface TableHeader {
  centers: number[];
  columns: number[];
  lefts: number[];
}
function positions(row: TextRow, labels: string[]): { centers: number[]; lefts: number[] } | null {
  const chars = row.items.flatMap((item) =>
    [...item.str]
      .map((c, n) => ({
        c,
        x: item.x + ((n + 0.5) * item.width) / item.str.length,
        left: item.x + (n * item.width) / item.str.length,
      }))
      .filter((i) => !/\s/.test(i.c)),
  );
  const str = chars.map((c) => c.c).join('');
  let from = 0;
  const centers: number[] = [];
  const lefts: number[] = [];
  for (const label of labels) {
    const at = str.indexOf(label, from);
    if (at < 0) return null;
    centers.push((chars[at]!.x + chars[at + label.length - 1]!.x) / 2);
    lefts.push(chars[at]!.left);
    from = at + label.length;
  }
  return { centers, lefts };
}
function headerCenters(row: TextRow): TableHeader | null {
  const standard = positions(row, [
    '项目名称',
    '规格型号',
    '单位',
    '数量',
    '单价',
    '金额',
    '税率',
    '税额',
  ]);
  if (standard) return { ...standard, columns: [0, 1, 2, 3, 4, 5, 6, 7] };
  const passenger = positions(row, ['项目名称', '单价', '数量', '金额', '税率', '税额']);
  return passenger ? { ...passenger, columns: [0, 4, 3, 5, 6, 7] } : null;
}
function cellsFor(row: TextRow, header: TableHeader): string[] {
  const cells = Array.from({ length: 8 }, () => '');
  const { centers, columns } = header;
  const boundaries = centers.slice(1).map((c, n) => (c + centers[n]!) / 2);
  if (columns[1] === 1) boundaries[0] = Math.max(boundaries[0]!, header.lefts[1]! - 5);
  const fragments = row.items.flatMap((item) =>
    /^[\d.+\-%,¥￥\s]+$/.test(item.str)
      ? [...item.str.matchAll(/\S+/g)].map((m) => ({
          ...item,
          str: m[0],
          x: item.x + (m.index * item.width) / item.str.length,
          width: (m[0].length * item.width) / item.str.length,
        }))
      : [item],
  );
  for (const item of fragments) {
    const center = item.x + item.width / 2;
    const n = boundaries.findIndex((b) => center < b);
    const index = columns[n < 0 ? columns.length - 1 : n]!;
    cells[index] += index < 3 ? item.str.trim() : compact(item.str);
  }
  return cells;
}
function fieldNear(items: PdfTextItem[], label: PdfTextItem, multiline = false): string {
  const first = items
    .filter((i) => i.page === label.page && i.x >= label.x - 1 && Math.abs(i.y - label.y) <= 4)
    .sort((a, b) => a.x - b.x);
  const rest = multiline
    ? textRows(
        items.filter((i) => i.page === label.page && i.x >= label.x - 1 && i.y > label.y + 4),
      ).flatMap((r) => r.items)
    : [];
  return compact([...first, ...rest].map((i) => i.str).join(''));
}
function readParty(rows: TextRow[], side: 0 | 1, splitX: number): { name: string; taxId: string } {
  const items = rows
    .flatMap((r) => r.items)
    .filter((i) => (side === 0 ? i.x < splitX - 1e-6 : i.x >= splitX - 1e-6));
  const name = items.find((i) => /^名称[:：]|^名$|^名称$/.test(compact(i.str)));
  const tax = items.find((i) => /统一社会信用代码|纳税人识别号/.test(compact(i.str)));
  return {
    name: name ? (fieldNear(items, name).match(/名称[:：]([^:：]+)/)?.[1] ?? '') : '',
    taxId: tax
      ? (fieldNear(items, tax, true).match(
          /(?:纳税人识别号|统一社会信用代码)(?:\/纳税人识别号)?[:：]([A-Z0-9-]+)/i,
        )?.[1] ?? '')
      : '',
  };
}
function readTrips(rows: TextRow[]): { trips: InvoiceTrip[]; privateItems: Set<PdfTextItem> } {
  const trips: InvoiceTrip[] = [];
  const privateItems = new Set<PdfTextItem>();
  let active: { centers: number[]; lefts: number[] } | null = null;
  let page = 0;
  for (const row of rows) {
    const next = positions(row, [
      '出行人',
      '有效身份证件号',
      '出行日期',
      '出发地',
      '到达地',
      '等级',
      '交通工具类型',
    ]);
    if (next) {
      active = next;
      page = row.page;
      continue;
    }
    if (!active) continue;
    const text = compact(row.items.map((i) => i.str).join(''));
    if (row.page !== page || /价税合计|小写|开票人|^备注/.test(text)) {
      active = null;
      continue;
    }
    const boundaries = active.centers.slice(1).map((c, n) => (c + active!.centers[n]!) / 2);
    const cells = Array.from({ length: 7 }, () => '');
    for (const i of row.items) {
      const n = boundaries.findIndex((b) => i.x + i.width / 2 < b);
      const col = n < 0 ? 6 : n;
      if (col === 1 || (i.x < boundaries[1]! && i.x + Math.max(i.width, 0) > boundaries[0]!)) {
        privateItems.add(i);
        continue;
      }
      cells[col] += i.str.trim();
    }
    if (cells.some(Boolean))
      trips.push({
        traveler: cells[0]!,
        date: normalizeDate(cells[2]!),
        departure: cells[3]!,
        destination: cells[4]!,
        grade: cells[5]!,
        transportType: cells[6]!,
      });
  }
  return { trips, privateItems };
}

export function invoiceFromTextItems(items: readonly PdfTextItem[], path: string): Invoice | null {
  const rows = textRows(items);
  const { trips, privateItems } = readTrips(rows);
  const text = rows
    .map((r) =>
      compact(
        r.items
          .filter((i) => !privateItems.has(i))
          .map((i) => i.str)
          .join(''),
      ),
    )
    .join('\n');
  const number = text.match(/发票号码[:：]([A-Z0-9-]+)/i)?.[1];
  const totalText = text.match(/[（(]小写[）)]\s*[¥￥]?\s*([+-]?[\d,]+\.\d{2})/)?.[1];
  if (!number || totalText === undefined || !/电子发票|增值税.*发票/.test(text)) return null;
  const total = numeric(totalText);
  if (total === null) return null;
  const firstHeader = rows.find((r) => headerCenters(r));
  const header = firstHeader ? headerCenters(firstHeader)! : null;
  const partyRows = firstHeader
    ? rows.filter((r) => r.page === firstHeader.page && r.y < firstHeader.y)
    : rows;
  const nameLabels = partyRows.flatMap((r) =>
    r.items.filter((i) => /^名称[:：]|^名$|^名称$/.test(compact(i.str))),
  );
  const leftLabel = Math.min(...nameLabels.map((i) => i.x));
  const rightLabel = Math.max(...nameLabels.map((i) => i.x));
  const leftEdge = Math.min(...partyRows.flatMap((row) => row.items.map((i) => i.x)));
  const partyItems = partyRows.flatMap((row) => row.items);
  const sellerEdge = partyItems.find(
    (i) =>
      compact(i.str) === '销' &&
      i.x > (leftLabel + rightLabel) / 2 &&
      i.x < rightLabel &&
      ['售', '方'].every((char) =>
        partyItems.some(
          (next) =>
            compact(next.str) === char &&
            Math.abs(next.x - i.x) < 1 &&
            next.y > i.y &&
            next.y - i.y <= i.height * 4,
        ),
      ),
  )?.x;
  const splitX =
    sellerEdge ??
    (rightLabel > leftLabel
      ? rightLabel - (leftLabel - leftEdge)
      : header
        ? (header.centers[3]! + header.centers[4]!) / 2
        : 300);
  const lines: InvoiceLine[] = [];
  if (firstHeader && header) {
    let activeHeader = header;
    let inTable = false;
    let page = 0;
    const rawLines: string[][] = [];
    const ends = rows.filter((r) =>
      /^(合计|价税合计)/.test(compact(r.items.map((i) => i.str).join(''))),
    );
    for (const row of rows) {
      if (row.page !== page) {
        inTable = false;
        page = row.page;
      }
      const next = headerCenters(row);
      if (next) {
        activeHeader = next;
        inTable = true;
        continue;
      }
      if (!inTable) continue;
      if (ends.some((end) => end.page === row.page && row.y >= end.y - 6)) {
        inTable = false;
        continue;
      }
      const rowText = compact(row.items.map((i) => i.str).join(''));
      if (/^(合计|价税合计|第\d+页|Page\d+)|[（(]小写[）)]|开票人[:：]/i.test(rowText)) {
        inTable = false;
        continue;
      }
      const cells = cellsFor(row, activeHeader);
      const name = cells[0]!;
      const hasNumbers = cells.slice(3).some((s) => /\d|免税|不征税/.test(s));
      const prev = rawLines.at(-1);
      const pending =
        prev &&
        !(numeric(prev[5]) !== null && (numeric(prev[7]) !== null || /免税|不征税/.test(prev[6]!)));
      if (prev && !name.startsWith('*') && (pending || !hasNumbers)) {
        cells.forEach((cell, n) => {
          prev[n] += cell;
        });
      } else if (hasNumbers || name.startsWith('*')) {
        rawLines.push(cells);
      }
    }
    for (const cells of rawLines) {
      const [
        name = '',
        specification = '',
        unit = '',
        qty = '',
        price = '',
        amount = '',
        rate = '',
        tax = '',
      ] = cells;
      lines.push(
        finishLine({
          name,
          specification,
          unit,
          quantity: numeric(qty),
          unitPrice: numeric(price),
          amount: numeric(amount),
          taxRate: /免税|不征税/.test(rate)
            ? 0
            : rate.endsWith('%')
              ? (numeric(rate.slice(0, -1)) ?? 0) / 100
              : numeric(rate),
          tax: /免税|不征税/.test(rate) && (!tax || tax === '***') ? 0 : numeric(tax),
        }),
      );
    }
  }
  const dateLabel = items.find((i) => /开票日期[:：]/.test(compact(i.str)));
  const date = normalizeDate(
    dateLabel ? fieldNear([...items], dateLabel) : (text.match(/开票日期[:：]([^\n]+)/)?.[1] ?? ''),
  );
  const totalRow = rows.findIndex((r) =>
    /[（(]小写[）)]/.test(compact(r.items.map((i) => i.str).join(''))),
  );
  const remarks = rows
    .slice(totalRow + 1)
    .map((r) =>
      r.items
        .filter((i) => !privateItems.has(i))
        .map((i) => i.str)
        .join(''),
    )
    .filter((s) => !/^[备注]$|开票人/.test(s))
    .join('\n')
    .replace(/^备注[:：]?/, '')
    .trim();
  const invoice = validateInvoice({
    number,
    ...(trips.length ? { trips } : {}),
    kind: 'domestic',
    invoiceType: defaults.legacyInvoiceKeywords.some((keyword) => text.includes(keyword))
      ? 'legacy'
      : 'digital',
    text,
    date,
    buyer: readParty(partyRows, 0, splitX),
    seller: readParty(partyRows, 1, splitX),
    lines,
    total,
    currency: 'CNY',
    sources: [source(path, 'pdf')],
    warnings: [],
    remarks,
  });
  if (!date) invoice.warnings.push('未能读取开票日期');
  return invoice;
}
export async function parseInvoicePdf(path: string): Promise<Invoice | null> {
  return invoiceFromTextItems(await extractPdfTextItems(path), path);
}
