import type { Finding, AttachmentType } from '../types.js';
import type { LaborRequirement } from '../labor/types.js';
export interface CorrectionTarget {
  id: string;
  label: string;
  kind: 'invoice' | 'labor' | 'attachment' | 'file' | 'group';
  findingKey?: string;
  relativePath?: string;
  sources?: string[];
  invoiceNumber?: string;
  invoiceNumbers?: string[];
  groupId?: string;
  folder: string;
  attachmentType?: AttachmentType;
  laborAttachmentType?: LaborRequirement['type'];
  laborFile?: string;
}
export interface CorrectionRequest {
  dir: string;
  source: string;
  targetId?: string;
}
export interface FileOperation {
  kind: 'archive' | 'copy' | 'retain' | 'confirm-attachment';
  from: string;
  to: string;
}
export interface ReplacementFile {
  path: string;
  sha256: string;
}
export interface ReplacementRecord {
  operation?: 'confirm-attachment' | 'reuse-file';
  retained?: ReplacementFile[];
  id: string;
  kind: 'apply' | 'undo';
  at: string;
  target: string;
  targetKey: string;
  source: string;
  destination: string;
  archived: (ReplacementFile & { original: string })[];
  inserted: ReplacementFile[];
  undoOf?: string;
}
export interface ReplacementHistory {
  version: 1;
  records: ReplacementRecord[];
}
export type CorrectionPreview =
  | { status: 'needs-target'; message: string; suggestedIds: string[] }
  | {
      status: 'checked';
      token: string;
      passed: boolean;
      resolved: boolean;
      target: string;
      destination?: string;
      targetRemaining?: Finding[];
      operations: FileOperation[];
      added: Finding[];
      remaining: Finding[];
      blockers: string[];
    };
