import type {
  Attachment,
  AttachmentType,
  Batch,
  CheckContext,
  CheckedGroup,
  CheckedInvoice,
  Finding,
  Group,
  Invoice,
  ManualEntry,
  Severity,
} from '../../types.js';
import type { RuleConfig } from '../config.js';
import type { Rule } from '../model.js';

export interface InvoiceAggregate {
  physical: boolean;
  highValueLines: number[];
}
export interface GroupAggregate {
  group: Group;
  images: string[];
  invoices: Invoice[];
  namedAi: boolean;
  delegatedInvoices: Invoice[];
  high: Invoice[];
  groupTotal: number;
  delegatedTotal: number;
  expenseContent: Map<Invoice, string>;
}
export interface Aggregates {
  sellerDay: Map<Invoice, string | null>;
  daily: Map<string, number>;
  invoices: Map<Invoice, InvoiceAggregate>;
  groups: GroupAggregate[];
  travelMatches: Map<string, { files: Attachment[]; candidates: Attachment[]; fallback: boolean }>;
  manualEntries: Map<Invoice, ManualEntry | undefined>;
}
export interface ResultCollector {
  readonly findings: Finding[];
  finding(
    ruleId: string,
    message: string,
    invoices?: Invoice[],
    groupId?: string,
    files?: string[],
    confirmed?: boolean,
    options?: { code?: string; severity?: Severity; requirementType?: AttachmentType },
  ): void;
  require(
    checked: CheckedGroup,
    group: GroupAggregate,
    type: AttachmentType,
    ruleId: import('../config.js').RuleId,
    reason: string,
    target: Invoice[],
    options?: { aggregation?: 'sellerDay'; coversSubsets?: boolean },
  ): void;
}

export interface EvalContext {
  batch: Batch;
  config: RuleConfig;
  context: CheckContext;
  aggregates: Aggregates;
  collector: ResultCollector;
  group: GroupAggregate;
  checked: CheckedGroup;
  invoice?: Invoice;
  item?: CheckedInvoice;
  rule: Rule;
}
