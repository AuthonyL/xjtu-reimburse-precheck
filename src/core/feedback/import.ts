import JSZip from 'jszip';
import { mkdtemp, mkdir, writeFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, posix, win32, resolve } from 'node:path';
import { pathWithin, samePath } from '../fs-path.js';
import type { FeedbackMeta, ParseIssue } from './bundle.js';
import type { FeedbackRecord, ConfigDifference } from '../../shared/feedback.js';
import { DEFAULTS_HASH } from './version.js';
import { FEEDBACK_TYPES } from '../../shared/feedback.js';
const MAX_TOTAL = 200 * 1024 * 1024;
function safePath(path: string) {
  if (
    !path ||
    path.includes('\\') ||
    /[:\x00-\x1f]/.test(path) ||
    posix.isAbsolute(path) ||
    win32.isAbsolute(path) ||
    path.split('/').some((p) => p === '..' || p === '.') ||
    path.includes('\0')
  )
    throw new Error('反馈包含不安全路径');
}
async function limited(entry: JSZip.JSZipObject, budget: { size: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const stream = entry.nodeStream('nodebuffer');
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      budget.size += chunk.length;
      if (size > 50 * 1024 * 1024 || budget.size > MAX_TOTAL) {
        stream.pause();
        reject(new Error('反馈包解压大小超限'));
      } else chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.resume();
  });
}
function validateMeta(v: unknown): FeedbackMeta {
  const m = v as FeedbackMeta;
  if (
    !m ||
    m.schemaVersion !== 1 ||
    typeof m.appVersion !== 'string' ||
    !/^[a-f0-9]{12}$/.test(m.rulesVersion?.defaults ?? '') ||
    !/^[a-f0-9]{12}$/.test(m.rulesVersion?.effective ?? '') ||
    typeof m.platform !== 'string' ||
    typeof m.arch !== 'string' ||
    typeof m.workspaceName !== 'string' ||
    /[\\/]/.test(m.workspaceName) ||
    typeof m.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(m.exportedAt))
  )
    throw new Error('反馈包 meta.json 格式不合法');
  return m;
}
const display = (v: unknown) =>
  v === undefined ? '（无）' : typeof v === 'string' ? v : JSON.stringify(v);
const oneLine = (v: unknown) =>
  display(v)
    .replace(/[\r\n]/g, ' ')
    .replace(/\|/g, '\\|');
interface RejectedRow {
  invoice?: { numberSuffix?: string; seller?: string; items?: string[]; total?: number } | null;
  recorded?: { reason?: string; recordedAt?: string } | null;
  inferred?: { ruleId: string; name: string }[];
}
const rejectedLine = (row: RejectedRow): string => {
  const inv = row.invoice;
  const head = inv
    ? `尾号 ${inv.numberSuffix ?? '?'} · ${inv.seller ?? '未知销方'} · ${(inv.items ?? []).join('、')} · ¥${inv.total ?? '?'}`
    : '拒票目录里已没有这张票';
  const recorded = row.recorded?.reason
    ? `记录原因：${row.recorded.reason}${row.recorded.recordedAt ? `（${row.recorded.recordedAt.slice(0, 10)}）` : ''}`
    : '未记录原因';
  const inferred = row.inferred?.length
    ? `推断：${row.inferred.map((r) => `${r.ruleId} ${r.name}`).join('、')}`
    : '';
  return oneLine([head, recorded, inferred].filter(Boolean).join('；'));
};
async function createOnly(file: string, content: string) {
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(file, content, { flag: 'wx' });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}
export async function importFeedback(
  bytes: Uint8Array,
  outDir: string,
): Promise<{ created: string[]; skipped: string[]; report: string }> {
  if (bytes.length > MAX_TOTAL) throw new Error('反馈包超过 200 MB');
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > 2000) throw new Error('反馈包文件过多');
  const allowed =
    /^(meta\.json|settings-diff\.json|feedback\.json|rejected-reasons\.json|parse-issues\/[\w-]+\.json|files\/.+)$/;
  const extracted = new Map<string, Buffer>();
  const budget = { size: 0 };
  const temp = await mkdtemp(join(tmpdir(), 'precheck-feedback-import-'));
  try {
    for (const entry of entries) {
      safePath(entry.name);
      const original = (entry as JSZip.JSZipObject & { unsafeOriginalName?: string })
        .unsafeOriginalName;
      if (original) safePath(original);
      if (
        entry.unixPermissions &&
        ((typeof entry.unixPermissions === 'string'
          ? parseInt(entry.unixPermissions, 8)
          : entry.unixPermissions) &
          0o170000) ===
          0o120000
      )
        throw new Error('反馈包不允许符号链接');
      if (entry.dir) continue;
      if (!allowed.test(entry.name)) throw new Error(`反馈包包含未知文件：${entry.name}`);
      const content = await limited(entry, budget);
      extracted.set(entry.name, content);
      const target = join(temp, entry.name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { flag: 'wx' });
    }
    const json = (name: string): unknown => {
      const content = extracted.get(name);
      if (!content) throw new Error(`反馈包缺少 ${name}`);
      return JSON.parse(content.toString('utf8'));
    };
    const meta = validateMeta(json('meta.json'));
    const feedback = json('feedback.json');
    const diffs = json('settings-diff.json');
    const rejected = json('rejected-reasons.json');
    if (
      !Array.isArray(feedback) ||
      feedback.some(
        (r) =>
          !r ||
          typeof r.ruleId !== 'string' ||
          typeof r.note !== 'string' ||
          !(r.type in FEEDBACK_TYPES),
      ) ||
      !Array.isArray(diffs) ||
      diffs.some((d) => !d || typeof d.path !== 'string') ||
      !Array.isArray(rejected)
    )
      throw new Error('反馈包数据格式不合法');
    const stamp = new Date(meta.exportedAt)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .slice(0, 15);
    const created: string[] = [];
    const skipped: string[] = [];
    const issues: ParseIssue[] = [];
    const pending: { file: string; content: string }[] = [];
    const write = async (file: string, content: string) => {
      pending.push({ file, content });
    };
    for (const [name, buffer] of [...extracted]
      .filter(([name]) => name.startsWith('parse-issues/'))
      .sort(([a], [b]) => a.localeCompare(b))) {
      const issue = JSON.parse(buffer.toString('utf8')) as ParseIssue;
      if (
        !issue ||
        typeof issue.file !== 'string' ||
        typeof issue.format !== 'string' ||
        !issue.result ||
        !Array.isArray(issue.warnings)
      )
        throw new Error(`解析诊断格式不合法：${name}`);
      if (
        issue.items &&
        (!Array.isArray(issue.items) ||
          issue.items.some(
            (i) =>
              typeof i.str !== 'string' ||
              ['x', 'y', 'width', 'height', 'page'].some(
                (k) => !Number.isFinite(i[k as keyof typeof i]),
              ),
          ))
      )
        throw new Error(`文字项格式不合法：${name}`);
      safePath(issue.file);
      issues.push(issue);
      const ordinal = posix.basename(name, '.json');
      const id = `${stamp}-${ordinal}`;
      await write(`tests/fixtures/feedback/${id}.json`, JSON.stringify(issue, null, 2) + '\n');
      const pdf = issue.format === 'pdf';
      const labor = issue.format === 'docx';
      const imports = pdf
        ? "import { invoiceFromTextItems } from '../../src/core/parse/pdf.js';"
        : labor
          ? "import { parseLaborText } from '../../src/core/labor/parse.js';\nimport { loadConfig } from '../../src/core/rules/config.js';"
          : "import { parseInvoiceXml } from '../../src/core/parse/xml.js';";
      const parse = pdf
        ? 'invoiceFromTextItems(fixture.items ?? [], fixture.file)'
        : labor
          ? "parseLaborText(fixture.text ?? '', loadConfig())"
          : "parseInvoiceXml(fixture.xml ?? '', fixture.file)";
      await write(
        `tests/feedback/${id}.test.ts`,
        `import { it, expect } from 'vitest';\n${imports}\nimport data from '../fixtures/feedback/${id}.json' with { type: 'json' };\nimport type { ParseIssue } from '../../src/core/feedback/bundle.js';\nconst fixture = data as ParseIssue;\n\n// TODO: 复现并修复后填写期望值，将 it.skip 改成 it。\nit.skip('反馈回归 ${id}', () => {\n  const actual = ${parse};\n  const expected: Record<string, unknown> | null = null; // TODO: 填入正确的字段断言。\n  expect(expected).not.toBeNull();\n  expect(actual).toMatchObject(expected ?? {});\n});\n`,
      );
    }
    const groups = new Map<string, FeedbackRecord[]>();
    for (const row of feedback as FeedbackRecord[])
      groups.set(row.ruleId, [...(groups.get(row.ruleId) ?? []), row]);
    const lines = [
      `# 反馈包 ${stamp}`,
      '',
      `APP ${oneLine(meta.appVersion)}；默认规则 ${meta.rulesVersion.defaults}；生效配置 ${meta.rulesVersion.effective}。`,
      meta.rulesVersion.defaults === DEFAULTS_HASH.slice(0, 12)
        ? '规则版本与当前仓库一致。'
        : '同学用的是旧规则（规则哈希与当前仓库不同，请确认版本）。',
      '',
      '## 这条不对',
      '',
      ...([...groups].length
        ? [...groups].flatMap(([id, rows]) => [
            `### ${oneLine(id)} · ${rows.length} 条`,
            '',
            ...rows.map(
              (r) => `- ${FEEDBACK_TYPES[r.type]}：${oneLine(r.note)}（${oneLine(r.directory)}）`,
            ),
            '',
          ])
        : ['无标记。', '']),
      '## 设置差异',
      '',
      ...(diffs as ConfigDifference[]).map(
        (d) =>
          `- ${oneLine(d.path)}：${oneLine(d.defaultValue)} → ${oneLine(d.currentValue)}${d.added ? `；新增 ${oneLine(d.added)}；删除 ${oneLine(d.removed)}` : ''}`,
      ),
      '',
      '## 拒票原因',
      '',
      ...(rejected as RejectedRow[]).map((r) => `- ${rejectedLine(r)}`),
      '',
      '## 解析诊断',
      '',
      ...issues.map(
        (i, n) =>
          `- ${n + 1}. ${oneLine(i.file)}（${oneLine(i.format)}）：${oneLine(i.result.error ?? i.warnings.join('；') ?? '')}`,
      ),
      '',
      '回归测试默认跳过；维护者修复后填写期望值，再启用测试。',
      '',
    ];
    const report = `private/docs/feedback/${stamp}.md`;
    await write(report, lines.join('\n'));
    // Validate every output parent before creating any fixture.
    for (const entry of pending) {
      const parent = dirname(join(resolve(outDir), entry.file));
      // Inspect the original ancestry before resolving any links in it.
      const lexical = { realpath: (file: string) => file };
      for (let part = parent; ; part = dirname(part)) {
        try {
          if ((await lstat(part)).isSymbolicLink()) throw new Error('导入输出路径不能为符号链接');
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        if (samePath(part, outDir, lexical)) break;
        if (part === dirname(part) || pathWithin(outDir, part, lexical) === null)
          throw new Error('导入输出路径越界');
      }
      if (pathWithin(outDir, parent) === null) throw new Error('导入输出路径越界');
    }
    for (const entry of pending)
      ((await createOnly(join(outDir, entry.file), entry.content)) ? created : skipped).push(
        entry.file,
      );
    return { created, skipped, report: join(outDir, report) };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
