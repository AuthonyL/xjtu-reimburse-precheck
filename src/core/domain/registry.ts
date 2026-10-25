import type { ClaimState } from './claim.js';

export interface RegistryEntry {
  number: string;
  claimId: string;
  batchDir: string;
  state: ClaimState;
  seller: string;
  total: number;
  currency: string;
  date: string;
  seenAt: string;
  sha256?: string[];
}

export interface Registry {
  version: 1;
  entries: RegistryEntry[];
}

export function submittedNumbers(registry: Registry, claimId: string): Set<string> {
  return new Set(
    registry.entries
      .filter(
        (entry) =>
          entry.claimId !== claimId &&
          (entry.state === 'submitted' || entry.state === 'reimbursed'),
      )
      .map((entry) => entry.number),
  );
}
