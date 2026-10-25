import { validateClaim, type Claim } from './domain/claim.js';

export const CLAIM_FILE = '_预检/claim.json';

export function readClaimFile(raw: unknown): Claim | null {
  return raw === undefined ? null : validateClaim(raw);
}
