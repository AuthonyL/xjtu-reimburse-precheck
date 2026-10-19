import type { RuleConfig } from '../rules/config.js';
import type {
  LaborDate,
  LaborFields,
  LaborRank,
  LaborType,
  LaborUnit,
  LaborManualEntry,
} from './types.js';

const numberPattern = '[0-9零〇一二两三四五六七八九十百]+(?:\\.[0-9]+)?';
const unitPattern = '人[·・]生|半天|小时|次|天|篇|套|份';
export function chineseNumber(text: string): number | null {
  if (/^[+-]/.test(text)) {
    const value = chineseNumber(text.slice(1));
    return value === null ? null : text[0] === '-' ? -value : value;
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  let total = 0;
  let digit = 0;
  for (const char of text) {
    if (char === '十' || char === '百') {
      total += (digit || 1) * (char === '十' ? 10 : 100);
      digit = 0;
    } else if (char in digits) digit = digits[char]!;
    else return null;
  }
  return text ? total + digit : null;
}
const compact = (text: string) => text.normalize('NFKC').replace(/\s/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
export function parseLaborDates(text: string): LaborDate[] {
  const dates: LaborDate[] = [];
  let year: number | null = null;
  const pattern =
    /(?:(\d{4})年)?(\d{1,2})月(?:(\d{1,2})日?)?(?:[至到—-](?:(\d{1,2})月)?(\d{1,2})日)?/g;
  for (const match of compact(text).matchAll(pattern)) {
    if (match[1]) year = Number(match[1]);
    const month = Number(match[2]);
    const day = match[3] ? Number(match[3]) : null;
    if (month < 1 || month > 12) continue;
    if (day === null) {
      dates.push({ date: `${year ?? '-'}-${pad(month)}`, precision: 'month' });
      continue;
    }
    const start = new Date(Date.UTC(year ?? 2000, month - 1, day));
    if (start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) continue;
    const endMonth = match[4] ? Number(match[4]) : month;
    const endDay = match[5] ? Number(match[5]) : day;
    const end = new Date(Date.UTC(year ?? 2000, endMonth - 1, endDay));
    if (
      end.getUTCMonth() !== endMonth - 1 ||
      end.getUTCDate() !== endDay ||
      end < start ||
      +end - +start > 366 * 86400000
    )
      continue;
    for (let at = +start; at <= +end; at += 86400000) {
      const iso = new Date(at).toISOString().slice(0, 10);
      dates.push({ date: year === null ? '-' + iso.slice(4) : iso, precision: 'day' });
    }
  }
  return dates;
}
export function laborRank(title: string | null, config: RuleConfig): LaborRank | null {
  if (!title) return null;
  const options = Object.entries(config.labor.titles).flatMap(([rank, titles]) =>
    titles.map((t) => ({ rank: rank as LaborRank, title: t })),
  );
  return (
    options.sort((a, b) => b.title.length - a.title.length).find((t) => title.includes(t.title))
      ?.rank ?? null
  );
}
export function parseLaborText(raw: string, config: RuleConfig): LaborFields {
  const text = compact(raw);
  const before = text.split('于')[0]!.replace(/^.*?情况说明/, '');
  const titles = Object.values(config.labor.titles)
    .flat()
    .sort((a, b) => b.length - a.length);
  const title = titles.find((t) => before.endsWith(t)) ?? null;
  const head = title ? before.slice(0, -title.length) : before;
  let boundary = -1;
  for (const end of config.labor.organizationEndings) {
    const index = head.lastIndexOf(end);
    if (index >= 0) boundary = Math.max(boundary, index + end.length);
  }
  const organization = boundary > 0 ? head.slice(0, boundary) : null;
  const name =
    boundary > 0 && /^[\p{Script=Han}·]{2,8}$/u.test(head.slice(boundary))
      ? head.slice(boundary)
      : null;
  const type =
    (Object.keys(config.labor.typeKeywords) as LaborType[])
      .filter((t) => t !== 'consultation')
      .find((t) => config.labor.typeKeywords[t].some((k) => text.includes(k))) ??
    (config.labor.typeKeywords.consultation.some((k) => text.includes(k)) ? 'consultation' : null);
  const mode =
    (['online', 'offline'] as const).find((m) =>
      config.labor.modeKeywords[m].some((k) => text.includes(k)),
    ) ?? null;
  const price = text.match(
    new RegExp(
      `每(?:人[·・]?(?:每)?)?(${unitPattern})[^，。；元\\d+\\-零〇一二两三四五六七八九十百]{0,12}?([+-]?${numberPattern})元`,
    ),
  );
  const withoutPrice = text.replace(/每[^，。；]+/g, '');
  const quantity = withoutPrice.match(new RegExp(`([+-]?${numberPattern})(${unitPattern})`));
  const half = !quantity && /(?:服务|咨询|工作|共|计)半天/.test(withoutPrice);
  const total = text.match(/(?:共计|合计)([+-]?[\d,]+(?:\.\d+)?)元/);
  const datesText = text.includes('于') ? text.split('于')[1]!.split(/就|为|提供/)[0]! : text;
  return {
    organization,
    name,
    title,
    rank: laborRank(title, config),
    affiliation: organization
      ? config.labor.internalOrganizationKeywords.some((k) => organization.includes(k))
        ? 'internal'
        : 'external'
      : null,
    type,
    mode,
    dates: parseLaborDates(datesText),
    quantity: quantity ? chineseNumber(quantity[1]!) : half ? 1 : null,
    unit: (quantity?.[2]?.replace('・', '·') ?? (half ? '半天' : null)) as LaborUnit | null,
    priceUnit: (price?.[1]?.replace('・', '·') ?? null) as LaborUnit | null,
    unitPrice: price ? chineseNumber(price[2]!) : null,
    total: total ? Number(total[1]!.replaceAll(',', '')) : null,
    purpose:
      text
        .match(/就(.+?)提供|为(.+?)作/)
        ?.slice(1)
        .find(Boolean) ?? null,
  };
}
export function applyLaborManual(
  parsed: LaborFields,
  manual: LaborManualEntry,
  config: RuleConfig,
): LaborFields {
  const fields: LaborFields = structuredClone(parsed);
  for (const key of Object.keys(fields) as (keyof LaborFields)[])
    if (Object.hasOwn(manual, key))
      Object.assign(fields, { [key]: manual[key as keyof LaborManualEntry] });
  fields.rank = laborRank(fields.title, config);
  if (manual.organization !== undefined && manual.affiliation === undefined)
    fields.affiliation = fields.organization
      ? config.labor.internalOrganizationKeywords.some((k) => fields.organization!.includes(k))
        ? 'internal'
        : 'external'
      : null;
  return fields;
}
