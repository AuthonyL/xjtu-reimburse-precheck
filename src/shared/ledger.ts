import type { WorkspaceView } from './api.js';
import type { LedgerClaim } from '../core/export/ledger.js';
import { compareBatches } from '../core/batch-order.js';

export function ledgerClaims(view: WorkspaceView): LedgerClaim[] {
  return [...view.batches]
    .sort((a, b) => compareBatches(a.batch, b.batch))
    .map((row) => ({
      batchId: row.batch.id,
      batchDir: row.batch.dir,
      claim: row.claim,
      invoiceCount: row.report.invoiceCount,
      totalCny: row.report.totalCny,
      waived: row.waived,
    }));
}
