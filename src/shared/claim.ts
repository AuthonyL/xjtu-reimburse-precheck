import type { Claim } from '../core/domain/claim.js';
export type ClaimMeta = Pick<Claim, 'claimant' | 'project' | 'fund'>;
export interface Submission {
  claimId?: string;
  batchDir: string;
  batchId: string;
  markedAt: string;
  numbers: string[];
}
