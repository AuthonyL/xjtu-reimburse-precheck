import JSZip from 'jszip';
import path, { basename, extname, resolve, sep } from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { loadConfig, type RuleConfig } from '../rules/config.js';
import type { Batch, Report, Invoice, RejectedInfo } from '../types.js';
import type { LaborReport } from '../labor/types.js';
import type { FeedbackRecord, ConfigDifference } from '../../shared/feedback.js';
import {
  extractPdfTextItems,
  invoiceFromTextItems,
  textFromItems,
  type PdfTextItem,
} from '../parse/pdf.js';
import { parseForeignText } from '../parse/foreign.js';
import { parseInvoiceXml } from '../parse/xml.js';
import { extractDocxText } from '../labor/scan.js';
import { parseLaborText } from '../labor/parse.js';
import { readRejectedReasons } from '../rejected.js';
import { DEFAULTS_HASH, configDifferences, hashConfig } from './version.js';
import {
  createRedactionContext,
  redactItems,
  redactText,
  redactValue,
  redactXml,
  redactionTextRuns,
} from './redact.js';
export interface FeedbackWorkspace {
  rootDir: string;
  batches: { batch: Batch; report: Report }[];
  labor: LaborReport[];
  rejected?: { batch: Batch; info: RejectedInfo[] } | null;
}
export interface FeedbackMeta {
  schemaVersion: 1;
  appVersion: string;
  rulesVersion: { defaults: string; effective: string };
  platform: string;
  arch: string;
  exportedAt: string;
  workspaceName: string;
}
export interface ParseIssue {
  file: string;
  format: string;
  items?: PdfTextItem[];
  xml?: string;
  text?: string;
  result: { invoice: Invoice | null; labor?: unknown; error?: string };
  warnings: string[];
}
export interface FeedbackBundle {
  meta: FeedbackMeta;
  entries: { path: string; data: Buffer }[];
  samples: { before: string; after: string }[];
  buffer: Buffer;
}
export const workspaceIdentity = (root: string): string => hashConfig(resolve(root));
export function relativeFile(root: string, file: string, flavor: path.PlatformPath = path): string {
  const result = flavor.relative(flavor.resolve(root), flavor.resolve(file));
  if (flavor.isAbsolute(result) || result === '..' || result.startsWith('..' + flavor.sep))
    throw new Error('反馈文件必须在工作区内');
  return result.split(flavor.sep).join('/') || '.';
}
export function invoiceSummary(invoice: Invoice) {
  return {
    numberSuffix: invoice.number.slice(-6),
    taxCategories: [...new Set(invoice.lines.map((l) => l.taxCategory))],
    items: invoice.lines.map((l) => l.name.slice(0, 80)),
    total: invoice.total,
    seller: invoice.seller.name,
  };
}
const nonPersonal = (invoice: Invoice | null) =>
  invoice
    ? {
        ...invoice,
        text: undefined,
        remarks: undefined,
        trips: invoice.trips?.map(({ traveler, ...trip }) => trip),
      }
    : null;
export async function buildFeedbackBundle(input: {
  workspace: FeedbackWorkspace;
  config: RuleConfig;
  records: FeedbackRecord[];
  appVersion: string;
  includeOriginals?: boolean;
  additionalSettingsDiff?: ConfigDifference[];
  platform?: string;
  arch?: string;
  createdAt?: string;
}): Promise<FeedbackBundle> {
  const { workspace, config } = input;
  const root = resolve(workspace.rootDir);
  const key = workspaceIdentity(root);
  const records = input.records.filter((r) => r.workspaceKey === key);
  const invoices = [
    ...workspace.batches.flatMap((b) => b.batch.invoices),
    ...(workspace.rejected?.batch.invoices ?? []),
  ];
  const names = workspace.labor.flatMap((l) =>
    l.entries.flatMap((e) => [e.fields.name, e.parsed.name].filter((s): s is string => !!s)),
  );
  names.push(...records.flatMap((r) => r.people ?? []));
  const protectedTexts = invoices.flatMap((i) => [
    i.number,
    i.buyer.taxId,
    i.seller.taxId,
    i.buyer.name,
    i.seller.name,
  ]);
  protectedTexts.push(
    config.buyer.name,
    config.buyer.taxId,
    loadConfig().buyer.name,
    loadConfig().buyer.taxId,
  );
  protectedTexts.push(
    ...workspace.labor.flatMap((l) =>
      l.entries.flatMap((e) =>
        [e.fields.organization, e.parsed.organization].filter((s): s is string => !!s),
      ),
    ),
  );
  names.push(...invoices.flatMap((i) => i.trips?.map((t) => t.traveler) ?? []));
  const candidates = new Set<string>();
  for (const { batch, report } of [
    ...workspace.batches,
    ...(workspace.rejected
      ? [
          {
            batch: workspace.rejected.batch,
            report: { findings: workspace.rejected.batch.diagnostics },
          },
        ]
      : []),
  ]) {
    for (const f of report.findings)
      if (f.ruleId.split('/').includes('parse')) f.files.forEach((file) => candidates.add(file));
    batch.unidentified.filter((f) => f.parseFailed).forEach((f) => candidates.add(f.path));
  }
  workspace.labor.forEach((l) =>
    l.diagnostics
      .filter((f) => f.ruleId === 'parse')
      .forEach((f) => f.files.forEach((p) => candidates.add(p))),
  );
  records.flatMap((r) => r.files).forEach((p) => candidates.add(resolve(root, p)));
  const raw: {
    file: string;
    relative: string;
    bytes?: Buffer;
    items?: PdfTextItem[];
    xml?: string;
    text?: string;
    error?: string;
  }[] = [];
  let size = 0;
  for (const file of [...candidates].sort()) {
    const rel = relativeFile(root, file);
    let bytes: Buffer;
    try {
      const actual = await realpath(file);
      relativeFile(await realpath(root), actual);
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 * 1024)
        throw new Error(`反馈文件不是普通文件或超过 50 MB：${rel}`);
      size += stat.size;
      if (size > 200 * 1024 * 1024) throw new Error('反馈原文件总大小超过 200 MB');
      bytes = await readFile(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        raw.push({ file, relative: rel, error: '来源文件已不存在；保留历史反馈，未附原文件' });
        continue;
      }
      throw e;
    }
    const row: (typeof raw)[number] = { file, relative: rel, bytes };
    try {
      const ext = extname(file).toLowerCase();
      if (ext === '.pdf') {
        row.items = await extractPdfTextItems(file);
        row.text = textFromItems(row.items);
      } else if (ext === '.docx') row.text = await extractDocxText(bytes);
      else if (ext === '.xml') row.xml = bytes.toString('utf8');
      else if (ext === '.ofd') {
        const zip = await JSZip.loadAsync(bytes);
        for (const entry of Object.values(zip.files)) {
          if (!entry.dir && /\.xml$/i.test(entry.name)) {
            const text = await entry.async('string');
            if (text.includes('EInvoice')) {
              row.xml = text;
              break;
            }
          }
        }
        if (!row.xml) row.error = 'OFD 内未找到可读取的发票 XML';
      } else row.error = '此格式没有文字层诊断，仅列为反馈关联文件';
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
    }
    const text = row.text ?? row.xml ?? '';
    for (const m of text.matchAll(
      /(?:纳税人识别号|统一社会信用代码|BuyerIdNum|SellerIdNum)[^\w]*([A-Z0-9]{15,20})/g,
    ))
      protectedTexts.push(m[1]!);
    raw.push(row);
  }
  const ctx = createRedactionContext({
    names,
    texts: [
      ...raw.flatMap((r) => (r.items ? redactionTextRuns(r.items) : [r.text ?? r.xml ?? ''])),
      ...invoices.map((i) => i.text ?? ''),
    ],
    protectedTexts,
    roots: [root, root.split(sep).join('/')],
  });
  const meta: FeedbackMeta = {
    schemaVersion: 1,
    appVersion: input.appVersion,
    rulesVersion: {
      defaults: DEFAULTS_HASH.slice(0, 12),
      effective: hashConfig(config).slice(0, 12),
    },
    platform: input.platform ?? process.platform,
    arch: input.arch ?? process.arch,
    exportedAt: input.createdAt ?? new Date().toISOString(),
    workspaceName: basename(root),
  };
  const entries: FeedbackBundle['entries'] = [];
  const samples: FeedbackBundle['samples'] = [];
  const sample = (value: unknown): void => {
    if (samples.length >= 4) return;
    if (typeof value === 'string') {
      const after = redactText(value, ctx);
      if (after !== value) samples.push({ before: value, after });
    } else if (Array.isArray(value)) value.forEach(sample);
    else if (value && typeof value === 'object') Object.values(value).forEach(sample);
  };
  const json = (path: string, value: unknown) => {
    sample(value);
    entries.push({
      path,
      data: Buffer.from(JSON.stringify(redactValue(value, ctx), null, 2) + '\n'),
    });
  };

  json('meta.json', meta);
  json('settings-diff.json', [
    ...configDifferences(loadConfig(), config),
    ...(input.additionalSettingsDiff ?? []),
  ]);
  json(
    'feedback.json',
    records.map(({ people, ...record }) => record),
  );
  const reasons = workspace.rejected ? await readRejectedReasons(workspace.rejected.batch.dir) : {};
  const rejectedNumbers = new Set(workspace.rejected?.batch.invoices.map((i) => i.number) ?? []);
  json('rejected-reasons.json', [
    ...(workspace.rejected?.batch.invoices.map((invoice) => ({
      invoice: invoiceSummary(invoice),
      ...workspace.rejected!.info.find((info) => info.number === invoice.number),
      ...(reasons[invoice.number] ? { recorded: reasons[invoice.number] } : {}),
      number: undefined,
    })) ?? []),
    ...Object.values(reasons)
      .filter((r) => !rejectedNumbers.has(r.number))
      .map((recorded) => ({ invoice: null, recorded, inferred: [] })),
  ]);
  for (const [index, row] of raw.entries()) {
    const issue: ParseIssue = {
      file: row.relative,
      format: extname(row.file).slice(1).toLowerCase(),
      result: { invoice: null },
      warnings: [],
    };
    if (row.error) issue.result.error = row.error;
    let changedNonPersonal = false;
    try {
      if (row.items) {
        issue.items = redactItems(row.items, ctx);
        const before =
          invoiceFromTextItems(row.items, row.relative) ??
          parseForeignText(textFromItems(row.items), row.relative);
        const after =
          invoiceFromTextItems(issue.items, row.relative) ??
          parseForeignText(textFromItems(issue.items), row.relative);
        changedNonPersonal =
          JSON.stringify(nonPersonal(before)) !== JSON.stringify(nonPersonal(after));
        issue.result.invoice = after;
        if (!after) issue.result.error ??= '未识别为发票或海外收据';
      }
      if (row.xml) {
        issue.xml = redactXml(row.xml, ctx);
        issue.result.invoice = parseInvoiceXml(issue.xml, row.relative);
        if (!issue.result.invoice) issue.result.error ??= '未识别为发票 XML';
      }
      if (row.text && !issue.result.invoice) {
        issue.text = issue.items ? textFromItems(issue.items) : redactText(row.text, ctx);
        const labor = workspace.labor
          .flatMap((l) => l.entries)
          .find((e) => resolve(e.path) === resolve(row.file));
        if (labor) {
          issue.result.labor = parseLaborText(row.text, config);
          if (!row.error) delete issue.result.error;
        }
      }
    } catch (e) {
      issue.result.error = e instanceof Error ? e.message : String(e);
    }
    if (changedNonPersonal)
      throw new Error(
        `脱敏后非人名发票字段发生变化，请核对脱敏规则：${redactText(row.relative, ctx)}`,
      );
    const scannedWarnings = invoices
      .filter((i) => i.sources.some((s) => resolve(s.path) === resolve(row.file)))
      .flatMap((i) => i.warnings);
    const parseMessages = [
      ...workspace.batches.flatMap((b) => b.report.findings),
      ...(workspace.rejected?.batch.diagnostics ?? []),
      ...workspace.labor.flatMap((l) => l.diagnostics),
    ]
      .filter(
        (f) =>
          f.ruleId.split('/').includes('parse') &&
          f.files.some((file) => resolve(file) === resolve(row.file)),
      )
      .map((f) => f.message);
    issue.warnings = [
      ...new Set([...(issue.result.invoice?.warnings ?? []), ...scannedWarnings, ...parseMessages]),
    ];
    json(`parse-issues/${String(index + 1).padStart(3, '0')}.json`, issue);
    const before = row.text ?? row.xml ?? '';
    const after = redactText(before, ctx);
    if (before !== after && samples.length < 4) {
      const changed = ctx.names.find((n) => before.includes(n.name));
      const pos = changed ? before.indexOf(changed.name) : 0;
      const excerpt = before.slice(Math.max(0, pos - 25), pos + 160);
      samples.push({ before: excerpt, after: redactText(excerpt, ctx) });
    }
    if (input.includeOriginals && row.bytes)
      entries.push({ path: 'files/' + redactText(row.relative, ctx), data: row.bytes });
  }
  const zip = new JSZip();
  for (const entry of entries) {
    if (zip.file(entry.path)) throw new Error('脱敏文件名冲突，请调整文件名后导出');
    zip.file(entry.path, entry.data);
  }
  return {
    meta: redactValue(meta, ctx),
    entries,
    samples,
    buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  };
}
export type { ConfigDifference };
