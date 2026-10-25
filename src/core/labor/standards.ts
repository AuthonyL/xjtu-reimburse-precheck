import { buildRules } from '../rules/definitions.js';
import type { LaborStandardRule } from '../rules/model.js';
import type { RuleConfig } from '../rules/config.js';
import type {
  AppliedLaborStandard,
  LaborFields,
  LaborManualEntry,
  ConsultationStandard,
} from './types.js';

export const RANK_LABELS = { academic: '院士或全国知名专家', senior: '高级职称', other: '其他' };
export const PERIOD_LABELS = {
  halfDay: '半天',
  shortDay: '不超过两天（含）',
  longDay: '超过两天',
  communication: '通讯',
};
export const SCOPE_LABELS = { all: '所有人员', internal: '校内', external: '校外' };
export const FUND_LABELS = { horizontal: '横向', other: '其他经费' };
export const ROLE_LABELS = {
  ...RANK_LABELS,
  bachelor: '本科生',
  master: '硕士生',
  doctor: '博士生',
  teacher: '教师',
  administrative: '行政管理人员',
  any: '所有人员',
};
export function standardPosition(
  price: number | null,
  min: number | null,
  max: number,
): AppliedLaborStandard['position'] {
  return price === null
    ? 'unknown'
    : price > max + 1e-8
      ? 'above'
      : min !== null && price < min - 1e-8
        ? 'below'
        : 'within';
}
export function applicableStandards(
  fields: LaborFields,
  manual: LaborManualEntry,
  config: RuleConfig,
  standards: Pick<LaborStandardRule, 'consultation' | 'other'> = buildRules(config).find(
    (rule): rule is LaborStandardRule => rule.kind === 'laborStandard',
  )!,
): { rows: AppliedLaborStandard[]; missing?: string } {
  const rank = manual.nationalExpert ? 'academic' : manual.seniorStaff ? 'senior' : fields.rank;
  const pricingUnit = fields.priceUnit ?? fields.unit;
  if (!fields.type) return { rows: [], missing: '劳务类型未识别，请选择劳务类型后核对标准' };
  if (!pricingUnit) return { rows: [], missing: '计费单位未识别，请补充数量和单价单位' };
  if (fields.type === 'consultation') {
    if (!rank || !fields.affiliation || !fields.mode)
      return { rows: [], missing: '请补充职称、校内外和线上线下后核对咨询标准' };
    let period: ConsultationStandard['period'];
    if (fields.mode === 'online' && pricingUnit === '次') period = 'communication';
    else if (fields.mode === 'offline' && pricingUnit === '半天') period = 'halfDay';
    else if (
      fields.mode === 'offline' &&
      pricingUnit === '天' &&
      fields.quantity !== null &&
      ['天', '半天'].includes(fields.unit ?? '')
    )
      period = fields.quantity * (fields.unit === '半天' ? 0.5 : 1) <= 2 ? 'shortDay' : 'longDay';
    else return { rows: [], missing: '咨询计费单位不适用：线上按次，线下按半天或天，请核对' };
    const other = standards.consultation.find(
      (s) =>
        s.fund === 'other' &&
        s.scope === fields.affiliation &&
        s.rank === rank &&
        s.period === period,
    );
    const horizontal = standards.consultation.find(
      (s) =>
        s.fund === 'horizontal' &&
        s.scope === 'all' &&
        s.rank === (rank === 'academic' ? 'senior' : rank) &&
        s.period === period,
    );
    if (!other || !horizontal)
      return { rows: [], missing: '未配置完整的两套适用咨询标准，请在劳务标准中补齐' };
    return {
      rows: [other, horizontal].map((s) => ({
        label: [
          FUND_LABELS[s.fund],
          ...(s.fund === 'other' ? [SCOPE_LABELS[s.scope]] : []),
          RANK_LABELS[s.rank],
          `${PERIOD_LABELS[s.period]} ${s.min}–${s.max} 元/人·${period === 'communication' ? '次' : period === 'halfDay' ? '半天' : '天'}（${s.taxBasis === 'after' ? '税后' : '税前'}）`,
        ].join(' · '),
        min: s.min,
        max: s.max,
        taxBasis: s.taxBasis,
        position: standardPosition(fields.unitPrice, s.min, s.max),
      })),
    };
  }
  let role: keyof typeof ROLE_LABELS = 'any';
  if (fields.type === 'paperReview' || fields.type === 'defense') {
    if (!manual.studentLevel)
      return { rows: [], missing: '请补充学生层次后核对论文评审或答辩标准' };
    role = manual.studentLevel;
  } else if (fields.type === 'projectReview' || fields.type === 'lecture') {
    if (!rank) return { rows: [], missing: '请补充职称或人员等级后核对标准' };
    role = rank;
  } else if (fields.type === 'invigilation') {
    role =
      manual.personnelRole ??
      (config.labor.personnelKeywords.administrative.some((k) => (fields.title ?? '').includes(k))
        ? 'administrative'
        : config.labor.personnelKeywords.teacher.some((k) => (fields.title ?? '').includes(k))
          ? 'teacher'
          : 'any');
    if (role === 'any') return { rows: [], missing: '请确认监考人员为教师还是行政管理人员' };
    if (role === 'administrative' && !manual.workTime)
      return { rows: [], missing: '请补充监考是工作时间还是双休日、节假日' };
  }
  const row = standards.other.find(
    (s) =>
      s.type === fields.type &&
      s.role === role &&
      s.unit === pricingUnit &&
      (s.workTime === 'any' || s.workTime === manual.workTime),
  );
  if (!row) return { rows: [], missing: '当前类型、人员和计费单位没有适用标准，请核对或补充配置' };
  return {
    rows: [
      {
        label: `${ROLE_LABELS[row.role]} · 上限 ${row.max} 元/人·${row.unit}；${row.note}`,
        min: null,
        max: row.max,
        position: standardPosition(fields.unitPrice, null, row.max),
      },
    ],
  };
}
