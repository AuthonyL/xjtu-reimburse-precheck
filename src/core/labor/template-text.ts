import type { RuleConfig } from '../rules/config.js';
import type { LaborFields } from './types.js';

export function formatLaborDate(date: string): string {
  const match = date.match(/^(\d{4}|-)-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return date;
  return `${match[1] === '-' ? '' : match[1] + ' 年 '}${Number(match[2])} 月${match[3] ? ' ' + Number(match[3]) + ' 日' : ''}`;
}
export function generateLaborText(fields: LaborFields, config: RuleConfig): string {
  const values: Record<string, string> = {
    单位: fields.organization ?? '【单位】',
    姓名: fields.name ?? '【姓名】',
    职称: fields.title ?? '【职称】',
    日期列表: fields.dates.length
      ? fields.dates.map((d) => formatLaborDate(d.date)).join('、')
      : '【具体日期】',
    事由: fields.purpose ?? '【事由】',
    形式: fields.mode === 'online' ? '线上' : fields.mode === 'offline' ? '线下' : '【线上/线下】',
    '线上/线下':
      fields.mode === 'online' ? '线上' : fields.mode === 'offline' ? '线下' : '【线上/线下】',
    数量: fields.quantity === null ? '【数量】' : String(fields.quantity),
    单位词: fields.unit ?? '【单位词】',
    单价单位词: fields.priceUnit ?? fields.unit ?? '【单价单位词】',
    单价: fields.unitPrice === null ? '【单价】' : String(fields.unitPrice),
    合计: fields.total === null ? '【合计】' : String(fields.total),
  };
  return config.labor.templates[fields.type ?? 'other']
    .replace(/每\{单位词\}/g, '每{单价单位词}')
    .replace(/\{([^{}]+)\}/g, (_, key: string) => values[key] ?? `【${key}】`);
}
