import type { RuleConfig } from '../rules/config.js';
import { LABOR_TYPES, type LaborManualEntry } from './types.js';

export const LABOR_UNITS = ['次', '天', '半天', '小时', '篇', '人·生', '套', '份'];
export function validateLaborDates(value: unknown): void {
  if (!Array.isArray(value)) throw new Error('劳务日期必须为数组');
  for (const raw of value) {
    const d = raw as { date: string; precision: string };
    if (!d || typeof d.date !== 'string' || !['day', 'month'].includes(d.precision))
      throw new Error('劳务日期格式不合法');
    const normalized = d.date.startsWith('--') ? '2000' + d.date.slice(1) : d.date;
    const full = d.precision === 'month' ? normalized + '-01' : normalized;
    if (
      !(d.precision === 'day' ? /^(?:\d{4}|-)-\d{2}-\d{2}$/ : /^(?:\d{4}|-)-\d{2}$/).test(d.date) ||
      Number.isNaN(Date.parse(full)) ||
      new Date(full).toISOString().slice(0, 10) !== full
    )
      throw new Error('劳务日期无效');
  }
}
export function validateLaborManual(value: unknown): Record<string, LaborManualEntry> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('labor 必须为情况说明路径到手填字段的映射');
  const output: Record<string, LaborManualEntry> = Object.create(null) as Record<
    string,
    LaborManualEntry
  >;
  for (const [file, raw] of Object.entries(value)) {
    if (
      !file ||
      file.includes('\\') ||
      file.startsWith('/') ||
      /^[A-Za-z]:/.test(file) ||
      file.split('/').some((p) => !p || p === '.' || p === '..')
    )
      throw new Error('劳务说明路径必须为目录内相对路径（用 / 分隔）');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('劳务手填条目必须为对象');
    for (const [key, v] of Object.entries(raw)) {
      if (['nationalExpert', 'seniorStaff'].includes(key)) {
        if (typeof v !== 'boolean') throw new Error('劳务勾选项必须为布尔值');
      } else if (['name', 'organization', 'title', 'purpose'].includes(key)) {
        if (v !== null && typeof v !== 'string') throw new Error('劳务文字字段不合法');
      } else if (['quantity', 'unitPrice', 'total', 'tableAmount'].includes(key)) {
        if (
          (v !== null || key === 'tableAmount') &&
          (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (key === 'quantity' && v === 0))
        )
          throw new Error('劳务金额和数量必须为合法非负数（数量大于零）');
      } else if (key === 'dates') validateLaborDates(v);
      else {
        const enums: Record<string, string[]> = {
          affiliation: ['internal', 'external'],
          type: Object.keys(LABOR_TYPES),
          mode: ['online', 'offline'],
          unit: LABOR_UNITS,
          priceUnit: LABOR_UNITS,
          studentLevel: ['bachelor', 'master', 'doctor'],
          workTime: ['work', 'holiday'],
          personnelRole: ['teacher', 'administrative'],
        };
        if (
          !Object.hasOwn(enums, key) ||
          (v !== null && !enums[key]!.includes(v as string)) ||
          (v === null && ['studentLevel', 'workTime', 'personnelRole'].includes(key))
        )
          throw new Error(`劳务手填字段 ${key} 不合法`);
      }
    }
    output[file] = structuredClone(raw) as LaborManualEntry;
  }
  return output;
}
export function validateLaborStandards(config: RuleConfig): void {
  const keys = new Set<string>();
  for (const row of config.laborStandards.consultation) {
    if (
      !['horizontal', 'other'].includes(row.fund) ||
      !['all', 'internal', 'external'].includes(row.scope) ||
      !['academic', 'senior', 'other'].includes(row.rank) ||
      !['halfDay', 'shortDay', 'longDay', 'communication'].includes(row.period) ||
      !['before', 'after'].includes(row.taxBasis)
    )
      throw new Error('咨询标准枚举不合法');
    if (
      (row.fund === 'horizontal' && (row.scope !== 'all' || row.rank === 'academic')) ||
      (row.fund === 'other' && row.scope === 'all')
    )
      throw new Error('咨询标准的经费与人员范围不适用');
    if (!Number.isFinite(row.min) || !Number.isFinite(row.max) || row.min < 0 || row.max < row.min)
      throw new Error('咨询标准上下限不合法');
    const key = [row.fund, row.scope, row.rank, row.period].join(':');
    if (keys.has(key)) throw new Error('咨询标准行重复');
    keys.add(key);
  }
  keys.clear();
  for (const row of config.laborStandards.other) {
    if (
      !Object.hasOwn(LABOR_TYPES, row.type) ||
      (row.type as string) === 'consultation' ||
      ![
        'academic',
        'senior',
        'other',
        'bachelor',
        'master',
        'doctor',
        'teacher',
        'administrative',
        'any',
      ].includes(row.role) ||
      !['any', 'work', 'holiday'].includes(row.workTime)
    )
      throw new Error('其他劳务标准枚举不合法');
    if (!LABOR_UNITS.includes(row.unit)) throw new Error('其他劳务标准计费单位不合法');
    if (!Number.isFinite(row.max) || row.max < 0) throw new Error('其他劳务上限不合法');
    const key = [row.type, row.role, row.unit, row.workTime].join(':');
    if (keys.has(key)) throw new Error('其他劳务标准行重复');
    keys.add(key);
  }
}
