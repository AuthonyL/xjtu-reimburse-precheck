import type { RuleConfig } from '../core/rules/config.js';
import type { Finding } from '../core/types.js';

export const FEEDBACK_TYPES = {
  falsePositive: '误报（不该提示）',
  falseNegative: '漏报或应该更严',
  unclear: '说明不清楚',
  other: '其他',
} as const;
export type FeedbackType = keyof typeof FEEDBACK_TYPES;
export interface FeedbackInvoice {
  numberSuffix: string;
  taxCategories: string[];
  items: string[];
  total: number;
  seller: string;
}
export interface FeedbackRecord {
  people?: string[];
  id: string;
  recordedAt: string;
  type: FeedbackType;
  note: string;
  ruleId: string;
  problemKey: string;
  message: string;
  action: string;
  workspaceKey: string;
  workspaceName: string;
  directory: string;
  files: string[];
  invoices: FeedbackInvoice[];
  configHash: string;
}
export interface FeedbackState {
  records: FeedbackRecord[];
  workspaceKey: string | null;
  workspaceDir?: string | null;
}
export interface FeedbackInput {
  directory: string;
  problemKey: string;
  type: FeedbackType;
  note: string;
}
export interface ConfigDifference {
  path: string;
  defaultValue: unknown;
  currentValue: unknown;
  added?: string[];
  removed?: string[];
}
export interface RuleUpgradeItem {
  path: string;
  oldDefault: unknown;
  newDefault: unknown;
  currentValue: unknown;
}
export interface RuleVersionInfo {
  defaultsHash: string;
  configHash: string;
  customized: number;
  imported?: { file: string; importedAt: string };
  upgrade?: { fromHash: string; toHash: string; items: RuleUpgradeItem[] };
}
export type UpgradeChoices = Record<string, 'default' | 'mine'>;
export interface FeedbackPreview {
  token: string;
  files: { path: string; size: number }[];
  samples: { before: string; after: string }[];
  includeOriginals: boolean;
}
export interface RuleUpgradeResult {
  rules: RuleConfig;
  version: RuleVersionInfo;
}
export interface FeedbackFindingRequest {
  finding: Finding;
  directory: string;
}

import { problemKey, relativeProblemFile } from '../core/correction/problems.js';
export function feedbackProblemKey(finding: Finding, directory: string): string {
  return problemKey(
    {
      ...finding,
      files: finding.files.map((file) => {
        const rel = relativeProblemFile(directory, file);
        return /^(?:[A-Za-z]:|\/)/.test(rel)
          ? '[其他目录]/' + rel.replaceAll('\\', '/').split('/').at(-1)
          : rel;
      }),
    },
    directory,
  );
}
