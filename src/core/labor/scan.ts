import { parseInvoiceXml } from '../parse/xml.js';
import { parseForeignText } from '../parse/foreign.js';
import { parseOfd } from '../parse/ofd.js';
import type { Invoice } from '../types.js';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { RuleConfig } from '../rules/config.js';
import { extractPdfTextItems, invoiceFromTextItems, textFromItems } from '../parse/pdf.js';
import { readManual } from '../manual.js';
import { parseLaborText } from './parse.js';
import type { LaborScan } from './types.js';

export const isLaborDirectoryName = (name: string, config: RuleConfig): boolean =>
  config.groupKeywords.labor.some((k) => k.toLowerCase() === name.toLowerCase());
export async function findLaborDirectories(
  root: string,
  config: RuleConfig,
  kind: 'root' | 'batch' = 'root',
): Promise<string[]> {
  const result: string[] = [];
  async function visit(dir: string) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (
        !e.isDirectory() ||
        e.isSymbolicLink() ||
        e.name.startsWith('.') ||
        e.name === '_预检' ||
        e.name === 'tmp' ||
        e.name === '无法报销费用'
      )
        continue;
      if (isLaborDirectoryName(e.name, config)) result.push(join(dir, e.name));
      else await visit(join(dir, e.name));
    }
  }
  await visit(root);
  return result;
}
export async function extractDocxText(data: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('Word 缺少 word/document.xml');
  const xml = await file.async('string');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Word XML 不允许外部实体');
  const parsed: unknown = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    trimValues: false,
    parseTagValue: false,
  }).parse(xml);
  const texts: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'w:t' && Array.isArray(child))
        texts.push(child.map((v) => (v as Record<string, string>)['#text'] ?? '').join(''));
      else if (key !== '#text' && key !== ':@') {
        walk(child);
        if (key === 'w:p') texts.push('\n');
      }
    }
  };
  walk(parsed);
  return texts.join('');
}
export async function scanLaborDirectory(input: string, config: RuleConfig): Promise<LaborScan> {
  const dir = resolve(input);
  if ((await lstat(dir)).isSymbolicLink()) throw new Error('劳务目录不允许使用符号链接');
  const scan: LaborScan = {
    dir,
    statements: [],
    attachments: [],
    manual: { version: 1, entries: [] },
    diagnostics: [],
  };
  const misplaced = new Map<string, string[]>();
  const issue = (file: string, message: string) =>
    scan.diagnostics.push({
      ruleId: 'parse',
      severity: 'warning',
      message,
      action: '打开原件核对；提供有文字层的 PDF 或 Word 情况说明。',
      files: [file],
      invoiceNumbers: [],
    });
  async function visit(current: string) {
    for (const e of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN'),
    )) {
      if (e.isSymbolicLink() || e.name.startsWith('.') || e.name === '_预检' || e.name === 'tmp')
        continue;
      const file = join(current, e.name);
      if (e.isDirectory()) {
        await visit(file);
        continue;
      }
      if (!e.isFile() || config.ignoredExtensions.includes(extname(file).toLowerCase())) continue;
      const rel = relative(dir, file).split(sep).join('/');
      const ext = extname(file).toLowerCase();
      let text = '';
      let invoice: Invoice | null = null;
      let noText = false;
      try {
        if (ext === '.pdf') {
          const items = await extractPdfTextItems(file);
          text = textFromItems(items);
          invoice = invoiceFromTextItems(items, file) ?? parseForeignText(text, file);
          noText = !text.trim();
        } else if (ext === '.xml') invoice = parseInvoiceXml(await readFile(file, 'utf8'), file);
        else if (ext === '.ofd') invoice = (await parseOfd(file, rel)).invoice;
        else if (ext === '.docx') text = await extractDocxText(await readFile(file));
      } catch (error) {
        issue(file, `劳务文件解析失败：${error instanceof Error ? error.message : String(error)}`);
      }
      if (invoice) {
        misplaced.set(invoice.number, [...(misplaced.get(invoice.number) ?? []), file]);
        scan.attachments.push({
          path: file,
          relativePath: rel,
          noText: false,
          label: '发票（未按发票检查）',
        });
        continue;
      }
      const isTable = config.labor.paymentTableKeywords.some((k) => e.name.includes(k));
      if (
        !isTable &&
        text.trim() &&
        ['.pdf', '.docx'].includes(ext) &&
        config.labor.statementKeywords.some((k) =>
          (text.replace(/\s/g, '') + basename(file)).includes(k),
        )
      )
        scan.statements.push({
          modifiedAt: (await lstat(file)).mtimeMs,
          path: file,
          relativePath: rel,
          text,
          parsed: parseLaborText(text, config),
        });
      else
        scan.attachments.push({
          path: file,
          relativePath: rel,
          noText,
          label: noText ? '发放表（无文字层，请手填金额核对）' : isTable ? '发放表' : '附件',
        });
    }
  }
  await visit(dir);
  if (misplaced.size)
    scan.diagnostics.push({
      ruleId: 'parse',
      code: 'invoices-in-labor',
      severity: 'warning',
      message: `劳务费目录里有 ${misplaced.size} 张发票，未按发票检查，建议移到单独的批次文件夹`,
      action: '将这些发票及相关附件移到劳务目录之外的独立批次，再检查该批次。',
      invoiceNumbers: [...misplaced.keys()],
      files: [...misplaced.values()].flat(),
    });
  try {
    scan.manual = await readManual(dir);
  } catch (error) {
    issue(
      join(dir, '_预检/manual.json'),
      `劳务手填数据无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return scan;
}
