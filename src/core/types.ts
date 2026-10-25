import type { Claim } from './domain/claim.js';

export type Severity = 'error' | 'warning' | 'info';
export type AttachmentType =
  | 'payment'
  | 'inventory'
  | 'store'
  | 'designList'
  | 'exchangeRate'
  | 'subscription'
  | 'highValueApproval'
  | 'systemApproval'
  | 'explanation'
  | 'assetRegistration'
  | 'contract'
  | 'waybill'
  | 'itinerary'
  | 'repairList'
  | 'verification'
  | 'purposeNote'
  | 'acceptanceNote'
  | 'schoolForm';
export interface Party {
  name: string;
  taxId: string;
}
export interface InvoiceLine {
  discount?: boolean;
  name: string;
  taxCategory: string;
  specification: string;
  unit: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  taxRate: number | null;
  tax: number | null;
  grossUnitPrice: number | null;
}
export interface SourceFile {
  path: string;
  relativePath: string;
  format: 'pdf' | 'xml' | 'ofd' | 'manual';
  sha256?: string;
}
export interface InvoiceTrip {
  traveler: string;
  date: string;
  departure: string;
  destination: string;
  grade: string;
  transportType: string;
}
export interface Invoice {
  trips?: InvoiceTrip[];
  number: string;
  kind: 'domestic' | 'foreign' | 'manual';
  invoiceType: 'digital' | 'legacy' | 'foreign' | 'manual';
  text?: string;
  date: string;
  buyer: Party;
  seller: Party;
  lines: InvoiceLine[];
  total: number;
  currency: string;
  sources: SourceFile[];
  warnings: string[];
  remarks?: string;
}
export interface Attachment {
  amounts?: number[];
  type: AttachmentType | 'unnamed';
  path: string;
  relativePath: string;
  directory: string;
}
export interface UnidentifiedFile {
  path: string;
  relativePath: string;
  isPdf: boolean;
  parseFailed: boolean;
}
export interface InboxItem {
  path: string;
  relativePath: string;
  batchDir: string;
  group: string;
  kind: 'unidentified' | 'unnamed' | 'parseFailed';
  suggestions: AttachmentType[];
}
export interface Group {
  id: string;
  name: string;
  dir: string;
  invoiceNumbers: string[];
  flags: { deferred: boolean; bankTransfer: boolean; outsourced: boolean; ai: boolean };
}
export interface Finding {
  id: string;
  ruleIds: string[];
  resolution?: 'open' | 'waived';
  code?: string;
  requirementType?: AttachmentType;
  severity: Severity;
  ruleId: string;
  message: string;
  action: string;
  invoiceNumbers: string[];
  files: string[];
  groupId?: string;
}
export interface Requirement {
  id: string;
  type: AttachmentType;
  ruleIds: string[];
  reason: string;
  invoiceNumbers: string[];
  foundFiles: Attachment[];
  candidateFiles: Attachment[];
  status: 'found' | 'unconfirmed' | 'missing';
  note?: string;
}
/** 汇率为 rateBase 单位外币兑人民币，默认 rateBase=1；日期必须为实际支付日。 */
export interface ManualEntry {
  sourceFile?: string;
  group?: string;
  number?: string;
  seller?: string;
  currency: string;
  amount: number;
  paymentDate: string;
  exchangeRate?: number;
  rateBase?: number;
  exchangeRateType?: string;
}
export interface ManualData {
  version: 1;
  entries: ManualEntry[];
  ignored?: string[];
  attachments?: Record<string, AttachmentType>;
  laborAttachments?: Record<string, import('./labor/types.js').LaborRequirement['type']>;
  labor?: Record<string, import('./labor/types.js').LaborManualEntry>;
}
export interface Batch {
  claim?: Claim;
  batchDate?: string;
  batchDateSource?: 'name' | 'invoice' | 'modified';
  id: string;
  dir: string;
  invoices: Invoice[];
  attachments: Attachment[];
  groups: Group[];
  unidentified: UnidentifiedFile[];
  diagnostics: Finding[];
  manual: ManualData;
  submitted: boolean;
}
export interface ScanOptions {
  config?: import('./rules/config.js').RuleConfig;
}
export interface CheckContext {
  otherBatches?: Batch[];
  submittedHistory?: ReadonlySet<string>;
  rejectedNumbers?: ReadonlySet<string>;
  rejectedInfo?: ReadonlyMap<string, RejectedInfo>;
}
export interface RejectedReason {
  number: string;
  reason: string;
  recordedAt: string;
  file: string;
}
export type RejectedReasons = Record<string, RejectedReason>;
export interface RejectedInfo {
  number: string;
  recorded?: RejectedReason;
  inferred: { ruleId: string; name: string }[];
}
export interface CheckedInvoice {
  invoice: Invoice;
  expenseContent: string;
  cnyAmount: number | null;
  highValueLines: number[];
}
export interface CheckedGroup {
  group: Group;
  invoices: CheckedInvoice[];
  requirements: Requirement[];
  expenseContent: string;
}
export interface CheckResult {
  batch: Batch;
  findings: Finding[];
  groups: CheckedGroup[];
}
export interface RequirementCounts {
  total: number;
  found: number;
  unconfirmed: number;
  missing: number;
}
export interface GroupReport extends CheckedGroup {
  totalCny: number;
  unconverted: CheckedInvoice[];
  requirementCounts: RequirementCounts;
}
export interface Report {
  waivers?: import('./domain/claim.js').Waiver[];
  batchId: string;
  groups: GroupReport[];
  findings: Finding[];
  totals: { expenseContent: string; amount: number }[];
  totalCny: number;
  invoiceCount: number;
  unconverted: CheckedInvoice[];
  incompleteGroups: string[];
  deferredGroups: GroupReport[];
  requirementCounts: RequirementCounts;
}
export interface RootResult {
  labor: import('./labor/types.js').LaborReport[];
  batches: Batch[];
  results: CheckResult[];
  reports: Report[];
  rejectedNumbers: Set<string>;
  rejected: Batch | null;
  rejectedInfo: Map<string, RejectedInfo>;
}
