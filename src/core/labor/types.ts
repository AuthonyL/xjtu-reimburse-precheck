import type { Finding, ManualData } from '../types.js';

export const LABOR_TYPES = {
  consultation: '咨询',
  lecture: '学术讲座',
  projectReview: '项目评审',
  paperReview: '论文评审',
  defense: '论文答辩',
  invigilation: '考试监考',
  examSetting: '考试命题',
  examGrading: '考试阅卷',
  editing: '编辑审稿',
  other: '其它',
} as const;
export type LaborType = keyof typeof LABOR_TYPES;
export type LaborRank = 'academic' | 'senior' | 'other';
export type LaborUnit = '次' | '天' | '半天' | '小时' | '篇' | '人·生' | '套' | '份';
export interface LaborDate {
  date: string;
  precision: 'day' | 'month';
}
export interface LaborFields {
  organization: string | null;
  name: string | null;
  title: string | null;
  rank: LaborRank | null;
  affiliation: 'internal' | 'external' | null;
  type: LaborType | null;
  mode: 'online' | 'offline' | null;
  dates: LaborDate[];
  quantity: number | null;
  unit: LaborUnit | null;
  priceUnit: LaborUnit | null;
  unitPrice: number | null;
  total: number | null;
  purpose: string | null;
}
export interface LaborManualEntry extends Partial<Omit<LaborFields, 'rank'>> {
  nationalExpert?: boolean;
  seniorStaff?: boolean;
  tableAmount?: number;
  studentLevel?: 'bachelor' | 'master' | 'doctor';
  workTime?: 'work' | 'holiday';
  personnelRole?: 'teacher' | 'administrative';
}
export interface ConsultationStandard {
  fund: 'horizontal' | 'other';
  scope: 'all' | 'internal' | 'external';
  rank: LaborRank;
  period: 'halfDay' | 'shortDay' | 'longDay' | 'communication';
  min: number;
  max: number;
  taxBasis: 'before' | 'after';
}
export interface OtherLaborStandard {
  type: Exclude<LaborType, 'consultation'>;
  role: LaborRank | 'bachelor' | 'master' | 'doctor' | 'teacher' | 'administrative' | 'any';
  unit: LaborUnit;
  max: number;
  workTime: 'any' | 'work' | 'holiday';
  note: string;
}
export interface LaborConfig {
  paymentTableKeywords: string[];
  personnelKeywords: Record<'teacher' | 'administrative', string[]>;
  statementKeywords: string[];
  organizationEndings: string[];
  internalOrganizationKeywords: string[];
  titles: Record<LaborRank, string[]>;
  typeKeywords: Record<LaborType, string[]>;
  modeKeywords: Record<'online' | 'offline', string[]>;
  reclassificationKeywords: string[];
  consultationFeeKeywords: string[];
  meetingKeywords: string[];
  attachmentKeywords: Record<'settlement' | 'notice' | 'attendance', string[]>;
  templates: Record<LaborType, string>;
}
export interface LaborAttachment {
  path: string;
  relativePath: string;
  label: string;
  noText: boolean;
}
export interface LaborStatement {
  modifiedAt?: number;
  path: string;
  relativePath: string;
  text: string;
  parsed: LaborFields;
}
export interface LaborScan {
  dir: string;
  statements: LaborStatement[];
  attachments: LaborAttachment[];
  manual: ManualData;
  diagnostics: Finding[];
}
export interface AppliedLaborStandard {
  label: string;
  min: number | null;
  max: number;
  taxBasis?: 'before' | 'after';
  position: 'below' | 'within' | 'above' | 'unknown';
}
export interface LaborRequirement {
  type: keyof LaborConfig['attachmentKeywords'];
  label: string;
  files: LaborAttachment[];
  status: 'found' | 'missing';
}
export interface LaborEntry extends LaborStatement {
  otherVersions?: string[];
  counted?: boolean;
  fields: LaborFields;
  manual: LaborManualEntry;
  findings: Finding[];
  standards: AppliedLaborStandard[];
  requirements: LaborRequirement[];
}
export interface LaborReport {
  payoutCount: number;
  versionGroups: LaborVersionGroup[];
  dir: string;
  name: string;
  entries: LaborEntry[];
  attachments: LaborAttachment[];
  diagnostics: Finding[];
  total: number;
  passed: number;
  issueCount: number;
}
export interface LaborVersionGroup {
  id: string;
  files: string[];
  selectedFile: string;
  note: string;
}
