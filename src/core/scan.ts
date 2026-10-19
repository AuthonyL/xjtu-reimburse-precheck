import { deriveBatchDate } from './batch-order.js';
import { itineraryAmounts } from './rules/travel.js';
import { ruleAction } from './rules/catalog.js';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { Batch, Finding, Invoice, ScanOptions } from './types.js';
import { canBeUnnamedAttachment, identifyAttachment, makeAttachment } from './attachments.js';
import { loadConfig, type RuleConfig } from './rules/config.js';
import { createGroups } from './group.js';
import { readManual } from './manual.js';
import { parseInvoiceXml } from './parse/xml.js';
import { extractPdfTextItems, invoiceFromTextItems, textFromItems } from './parse/pdf.js';
import { parseForeignText } from './parse/foreign.js';
import { parseOfd } from './parse/ofd.js';
import { isLaborDirectoryName } from './labor/scan.js';
import { probeDirectory } from './fs-probe.js';
import { relativePath, samePath, pathKey } from './fs-path.js';

export async function listDocuments(dir: string, config: RuleConfig): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries =
      current === dir
        ? await readdir(current, { withFileTypes: true })
        : ((await probeDirectory(current)) ?? []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (
        entry.isSymbolicLink() ||
        entry.name.startsWith('.') ||
        entry.name === '_预检' ||
        entry.name === 'tmp'
      )
        continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!isLaborDirectoryName(entry.name, config)) await visit(path);
      } else if (entry.isFile() && !config.ignoredExtensions.includes(extname(path).toLowerCase()))
        files.push(path);
    }
  }
  await visit(dir);
  return files;
}
function mergeInvoice(old: Invoice, incoming: Invoice): void {
  if (old.currency !== incoming.currency || Math.abs(old.total - incoming.total) > 0.01)
    old.warnings.push('同号不同来源的币种或价税合计不一致，请核对原件');
  if (old.date && incoming.date && old.date !== incoming.date)
    old.warnings.push('同号不同来源的开票日期不一致');
  for (const party of ['buyer', 'seller'] as const) {
    if (old[party].taxId && incoming[party].taxId && old[party].taxId !== incoming[party].taxId)
      old.warnings.push(`同号不同来源的${party === 'buyer' ? '购买方' : '销售方'}税号不一致`);
  }
  const priority = (invoice: Invoice): number =>
    Math.max(...invoice.sources.map((s) => ({ xml: 3, pdf: 2, ofd: 1, manual: 0 })[s.format]));
  const preferIncoming = priority(incoming) > priority(old);
  if (preferIncoming) {
    incoming.lines.forEach((line, n) => {
      const pdfLine = old.lines[n];
      if (!line.taxCategory && pdfLine?.taxCategory) {
        line.name = pdfLine.name;
        line.taxCategory = pdfLine.taxCategory;
      }
    });
    old.lines = incoming.lines;
    old.total = incoming.total;
    old.currency = incoming.currency;
    old.date = incoming.date || old.date;
    for (const party of ['buyer', 'seller'] as const)
      old[party] = {
        name: incoming[party].name || old[party].name,
        taxId: incoming[party].taxId || old[party].taxId,
      };
    old.remarks = incoming.remarks || old.remarks;
  } else if (incoming.sources.some((s) => s.format === 'pdf')) {
    old.lines.forEach((line, n) => {
      const pdfLine = incoming.lines[n];
      if (!line.taxCategory && pdfLine?.taxCategory) {
        line.name = pdfLine.name;
        line.taxCategory = pdfLine.taxCategory;
      }
    });
  }
  if (incoming.invoiceType === 'legacy') old.invoiceType = 'legacy';
  old.text = [old.text, incoming.text].filter(Boolean).join('\n');
  old.sources.push(...incoming.sources);
  old.warnings = [...new Set([...old.warnings, ...incoming.warnings])];
}
export async function scanBatch(inputDir: string, opts: ScanOptions = {}): Promise<Batch> {
  const dir = resolve(inputDir);
  const directoryStat = await lstat(dir);
  if (directoryStat.isSymbolicLink()) throw new Error('批次目录不能为符号链接');
  const config = opts.config ?? loadConfig();
  const files = await listDocuments(dir, config);
  const batch: Batch = {
    id: basename(dir),
    dir,
    invoices: [],
    attachments: [],
    groups: [],
    unidentified: [],
    diagnostics: [],
    manual: { version: 1, entries: [] },
    submitted: false,
  };
  const map = new Map<string, Invoice>();
  const documentAmounts = new Map<string, number[]>();
  const unresolvedOfd: { path: string; warning: string }[] = [];
  const add = (invoice: Invoice): void => {
    invoice.sources.forEach((s) => {
      s.relativePath = relativePath(dir, s.path);
    });
    const existing = map.get(invoice.number);
    if (existing) mergeInvoice(existing, invoice);
    else map.set(invoice.number, invoice);
  };
  const issue = (
    severity: Finding['severity'],
    ruleId: string,
    message: string,
    path: string,
  ): void => {
    batch.diagnostics.push({
      severity,
      ruleId,
      message,
      action: ruleAction(ruleId, undefined, path),
      files: [path],
      invoiceNumbers: [],
    });
  };
  for (const path of files) {
    const ext = extname(path).toLowerCase();
    const type = identifyAttachment(relativePath(dir, path), config);
    if (type === 'schoolForm') {
      batch.attachments.push(makeAttachment(path, dir, type));
      continue;
    }
    let invoice: Invoice | null = null;
    let documentText = '';
    let parseFailed = false;
    try {
      if (ext === '.xml') invoice = parseInvoiceXml(await readFile(path, 'utf8'), path);
      if (ext === '.pdf') {
        const items = await extractPdfTextItems(path);
        const text = textFromItems(items);
        documentText = text;
        documentAmounts.set(path, itineraryAmounts(path, text));
        invoice = invoiceFromTextItems(items, path) ?? parseForeignText(text, path);
        if (!invoice && /电子发票[（(]|\bRECEIPT\b|付款日期/i.test(text)) {
          parseFailed = true;
          issue('warning', 'parse', '疑似发票或收据，但关键字段读取失败，请人工核对', path);
        }
      }
      if (ext === '.ofd') {
        const result = await parseOfd(path, path);
        invoice = result.invoice;
        if (!invoice && !type) {
          unresolvedOfd.push({ path, warning: result.warning! });
          continue;
        }
      }
    } catch (error) {
      parseFailed = true;
      issue(
        'warning',
        'parse',
        `文件解析失败：${error instanceof Error ? error.message : String(error)}`,
        path,
      );
    }
    if (invoice) add(invoice);
    else if (type)
      batch.attachments.push({
        ...makeAttachment(path, dir, type),
        ...(type === 'itinerary' ? { amounts: itineraryAmounts(path, documentText) } : {}),
      });
    else {
      if (!parseFailed && canBeUnnamedAttachment(path))
        batch.attachments.push(makeAttachment(path, dir, 'unnamed'));
      else
        batch.unidentified.push({
          path,
          relativePath: relativePath(dir, path),
          isPdf: ext === '.pdf',
          parseFailed,
        });
      if (ext === '.pdf' && !parseFailed)
        issue('info', 'unrecognized-pdf', '未识别 PDF，请确认是否为所需附件', path);
    }
  }
  for (const { path, warning } of unresolvedOfd) {
    const stem = basename(path, extname(path));
    const matches = [...map.values()].filter(
      (i) =>
        basename(path).includes(i.number) ||
        i.sources.some(
          (s) =>
            samePath(dirname(s.path), dirname(path)) && basename(s.path, extname(s.path)) === stem,
        ),
    );
    if (matches.length === 1)
      matches[0]!.sources.push({ path, relativePath: relativePath(dir, path), format: 'ofd' });
    else {
      issue('warning', 'ofd', warning, path);
      batch.unidentified.push({
        path,
        relativePath: relativePath(dir, path),
        isPdf: false,
        parseFailed: true,
      });
    }
  }
  try {
    batch.manual = await readManual(dir);
  } catch (error) {
    issue(
      'warning',
      'manual',
      `手填数据无效：${error instanceof Error ? error.message : String(error)}`,
      join(dir, '_预检/manual.json'),
    );
  }
  for (const [file, type] of Object.entries(batch.manual.attachments ?? {})) {
    const path = join(dir, file);
    if (!files.some((f) => samePath(f, path))) {
      issue('warning', 'manual', '附件覆盖对应文件不存在或已被忽略', path);
      continue;
    }
    if ([...map.values()].some((i) => i.sources.some((s) => samePath(s.path, path)))) {
      issue('warning', 'manual', '附件覆盖不能将已解析的发票改为附件', path);
      continue;
    }
    batch.attachments = batch.attachments.filter((a) => !samePath(a.path, path));
    batch.attachments.push({
      ...makeAttachment(path, dir, type),
      ...(type === 'itinerary'
        ? { amounts: documentAmounts.get(path) ?? itineraryAmounts(path) }
        : {}),
    });
    batch.unidentified = batch.unidentified.filter((f) => !samePath(f.path, path));
  }
  for (const [n, entry] of batch.manual.entries.entries()) {
    const file = entry.sourceFile ? join(dir, entry.sourceFile) : undefined;
    const path =
      file ?? join(dir, entry.group === '根目录' ? '' : (entry.group ?? ''), `manual-${n + 1}`);
    const found = [...map.values()].find(
      (i) => entry.number === i.number || (file && i.sources.some((s) => samePath(s.path, file))),
    );
    if (found) {
      if (found.kind === 'domestic') {
        issue('warning', 'manual', '手填外币数据不能覆盖国内发票', file ?? dir);
        continue;
      }
      if (!found.sources.some((s) => samePath(s.path, path))) {
        if (file && !files.some((f) => samePath(f, file))) {
          issue('warning', 'manual', '手填数据对应的来源文件不存在或已被忽略', file);
          continue;
        }
        found.sources.push({
          path,
          relativePath: relativePath(dir, path),
          format: 'manual',
        });
        issue('error', 'dup', '同号手填收据存在多个来源，保留首条金额，请核对重复票据', path);
        if (
          found.total !== entry.amount ||
          found.currency !== entry.currency ||
          found.date !== entry.paymentDate
        )
          found.warnings.push('同号手填收据的金额、币种或支付日期不一致，未覆盖首条数据');
        if (file) batch.unidentified = batch.unidentified.filter((f) => !samePath(f.path, file));
        continue;
      }
      found.total = entry.amount;
      found.currency = entry.currency;
      found.date = entry.paymentDate;
      if (entry.seller) found.seller.name = entry.seller;
      continue;
    }
    if (file && !files.some((f) => samePath(f, file))) {
      issue('warning', 'manual', '手填数据对应的来源文件不存在或已被忽略', file);
      continue;
    }
    const number = entry.number ?? `manual:${entry.sourceFile ?? `${entry.group}:${n + 1}`}`;
    if (map.has(number)) {
      issue('warning', 'manual', '手填号码重复，未创建第二张票据', path);
      continue;
    }
    add({
      number,
      kind: 'manual',
      invoiceType: 'manual',
      date: entry.paymentDate,
      buyer: { name: '', taxId: '' },
      seller: { name: entry.seller ?? '手填海外商家', taxId: '' },
      lines: [],
      total: entry.amount,
      currency: entry.currency,
      sources: [{ path, relativePath: relativePath(dir, path), format: 'manual' }],
      warnings: [],
    });
    if (file) batch.unidentified = batch.unidentified.filter((f) => !samePath(f.path, file));
  }
  batch.invoices = [...map.values()];
  const invoiceFiles = new Set(
    batch.invoices.flatMap((i) => i.sources.map((s) => pathKey(s.path))),
  );
  batch.attachments = batch.attachments.filter((a) => !invoiceFiles.has(pathKey(a.path)));
  batch.groups = createGroups(
    dir,
    [...files, ...batch.invoices.flatMap((i) => i.sources.map((s) => s.path))],
    batch.invoices,
    config,
  );
  batch.submitted = batch.attachments.some((a) => a.type === 'schoolForm');
  Object.assign(
    batch,
    deriveBatchDate(
      batch.id,
      batch.invoices.map((i) => i.date),
      directoryStat.mtimeMs,
    ),
  );
  return batch;
}
