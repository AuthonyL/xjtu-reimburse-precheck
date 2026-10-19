import type { PdfTextItem } from '../parse/pdf.js';
export interface RedactionContext {
  names: { name: string; alias: string }[];
  protectedTexts: string[];
  roots: string[];
}
const alias = (n: number): string =>
  n < 26 ? String.fromCharCode(65 + n) : alias(Math.floor(n / 26) - 1) + alias(n % 26);
const decodeXml = (s: string): string =>
  s
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (m, h: string, d: string) => {
      const code = parseInt(h ?? d, h ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

export function createRedactionContext(
  input: { names?: string[]; texts?: string[]; protectedTexts?: string[]; roots?: string[] } = {},
): RedactionContext {
  const names = [...(input.names ?? [])];
  for (const raw of input.texts ?? []) {
    const text = decodeXml(raw);
    for (const match of text.matchAll(
      /(?:开票人|出行人)\s*[:：]\s*([\u4e00-\u9fff·]{2,12})(?=\s|$|[，,；;<])/g,
    ))
      names.push(match[1]!);
    for (const match of text.matchAll(
      /(?:开票人|出行人)\s*[:：]\s*([A-Za-z][A-Za-z .'-]{1,79})(?=$|[\n<，,；;]|[\u4e00-\u9fff])/g,
    ))
      names.push(match[1]!.trim());
    for (const match of text.matchAll(
      /<(?:[\w-]+:)?(Drawer|DrawerName|Issuer|IssuerName|PassengerName|TravelerName|开票人|出行人)(?:\s[^>]*)?>\s*([^<]+?)\s*<\//gi,
    )) {
      const name = match[2]!.trim();
      if (name.length >= 2 && name.length <= 80 && !/[<>\d]/.test(name)) names.push(name);
    }
  }
  return {
    names: [...new Set(names.filter(Boolean))]
      .sort()
      .map((name, i) => ({ name, alias: '人员' + alias(i) })),
    protectedTexts: [...new Set(input.protectedTexts ?? [])]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length),
    roots: (input.roots ?? []).filter(Boolean).sort((a, b) => b.length - a.length),
  };
}
interface Span {
  start: number;
  end: number;
  replacement: string;
}
function spans(text: string, ctx: RedactionContext): Span[] {
  const protectedSpans: Span[] = [];
  for (const token of ctx.protectedTexts) {
    let pos = text.indexOf(token);
    while (pos >= 0) {
      protectedSpans.push({ start: pos, end: pos + token.length, replacement: token });
      pos = text.indexOf(token, pos + token.length);
    }
  }
  const found: Span[] = [];
  const add = (start: number, end: number, replacement: string) => {
    if (
      !protectedSpans.some((s) => start < s.end && end > s.start) &&
      !found.some((s) => start < s.end && end > s.start)
    )
      found.push({ start, end, replacement });
  };
  for (const root of ctx.roots) {
    let pos = text.indexOf(root);
    while (pos >= 0) {
      add(pos, pos + root.length, '[工作区]');
      pos = text.indexOf(root, pos + root.length);
    }
  }
  const patterns: [RegExp, string][] = [
    [/(?<![\w])\d{17}[\dXx](?![\w])/g, '[身份证已隐藏]'],
    [/(?<![\w])1[3-9]\d[ -]?\d{4}[ -]?\d{4}(?![\w])/g, '[手机号已隐藏]'],
    [/(?<![\w])\d{16,19}(?![\w])/g, '[银行卡已隐藏]'],
    [/(?<![\w])\d{4}(?:[ -]\d{4}){2,3}(?:[ -]\d{3})?(?![\w]|\.\d)/g, '[银行卡已隐藏]'],
    [/(?<![\w*])(?=[\d* -]*\*)(?:[\d*]{4}[ -]){2,3}[\d*]{3,4}(?![\w*]|\.\d)/g, '[银行卡已隐藏]'],
    [/(?<![\w*])(?=[\d*]*\*)[\d*]{8,19}(?![\w*])/g, '[银行卡已隐藏]'],
    [/(?<![\w])(?:\d[ -]?){2,6}(?:\*[ -]?){2,}(?:\d[ -]?){0,6}(?![\w])/g, '[银行卡已隐藏]'],
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已隐藏]'],
  ];
  for (const [pattern, replacement] of patterns)
    for (const m of text.matchAll(pattern)) add(m.index, m.index + m[0].length, replacement);
  for (const { name, alias } of [...ctx.names].sort((a, b) => b.name.length - a.name.length)) {
    let pos = text.indexOf(name);
    while (pos >= 0) {
      add(pos, pos + name.length, alias);
      pos = text.indexOf(name, pos + name.length);
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
export function redactText(text: string, ctx: RedactionContext): string {
  let result = '';
  let offset = 0;
  for (const span of spans(text, ctx)) {
    result += text.slice(offset, span.start) + span.replacement;
    offset = span.end;
  }
  return result + text.slice(offset);
}
export function redactValue<T>(value: T, ctx: RedactionContext): T {
  if (typeof value === 'string') return redactText(value, ctx) as T;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, ctx)) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [redactText(k, ctx), redactValue(v, ctx)]),
    ) as T;
  return value;
}
function adjacentRuns(items: PdfTextItem[]) {
  const sorted = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.page - b.item.page || a.item.y - b.item.y || a.item.x - b.item.x);
  const runs: (typeof sorted)[] = [];
  for (const entry of sorted) {
    const run = runs.at(-1);
    const previous = run?.at(-1)?.item;
    if (
      previous &&
      entry.item.page === previous.page &&
      Math.abs(entry.item.y - previous.y) < 2 &&
      entry.item.x - previous.x - previous.width <= Math.max(6, Math.min(18, previous.height * 1.3))
    )
      run!.push(entry);
    else runs.push([entry]);
  }
  return runs;
}
export const redactionTextRuns = (items: PdfTextItem[]): string[] =>
  adjacentRuns(items).map((run) => run.map(({ item }) => item.str).join(''));
export function redactItems(items: PdfTextItem[], ctx: RedactionContext): PdfTextItem[] {
  const output = items.map((i) => ({ ...i }));
  const runs = adjacentRuns(items);
  for (const run of runs) {
    const text = run.map(({ item }) => item.str).join('');
    const replacements = spans(text, ctx);
    let offset = 0;
    for (const { item, i } of run) {
      const start = offset;
      const end = start + item.str.length;
      let result = '';
      let cursor = start;
      for (const s of replacements) {
        if (s.end <= start || s.start >= end) continue;
        result += text.slice(cursor, Math.max(cursor, s.start));
        if (s.start >= start) result += s.replacement;
        cursor = Math.min(end, s.end);
      }
      output[i]!.str = result + text.slice(cursor, end);
      offset = end;
    }
  }
  return output;
}
export function redactXml(xml: string, ctx: RedactionContext): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = xml.replace(
    />([^<]+)</g,
    (_all, body: string) => '>' + escape(redactText(decodeXml(body), ctx)) + '<',
  );
  return redactText(
    text.replace(
      /(=\s*)(["'])(.*?)\2/g,
      (_all, prefix: string, quote: string, value: string) =>
        prefix +
        quote +
        escape(redactText(decodeXml(value), ctx)).replaceAll(
          quote,
          quote === '"' ? '&quot;' : '&apos;',
        ) +
        quote,
    ),
    ctx,
  );
}
