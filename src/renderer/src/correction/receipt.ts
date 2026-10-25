import type { WorkspaceView } from '../../../shared/api.js';
import type { CorrectionPreview, ReplacementRecord } from '../../../core/correction/types.js';
export type CheckedCorrection = Extract<CorrectionPreview, { status: 'checked' }>;
export interface CorrectionReceipt {
  dir: string;
  source: string;
  preview: CheckedCorrection;
  record?: ReplacementRecord;
}
export function receiptRecord(view: WorkspaceView, dir: string): ReplacementRecord | undefined {
  return (
    view.batches.find((b) => b.batch.dir === dir)?.replacements ??
    view.labor?.find((l) => l.report.dir === dir)?.replacements
  )?.records.at(-1);
}
