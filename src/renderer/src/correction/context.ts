import { createContext, type ReactNode } from 'react';
import type { Finding } from '../../../core/types.js';
import type { CorrectionPreview, CorrectionTarget } from '../../../core/correction/types.js';
export interface Request {
  finding?: Finding;
  file?: string;
  source?: string;
  targetId?: string;
  material?: { groupId: string; type: string };
}
export const CorrectionContext = createContext<((request?: Request) => void) | null>(null);
export interface DialogState {
  source: string;
  targetId: string;
  targets: CorrectionTarget[];
  message: string;
  preview: CorrectionPreview | null;
}
export interface ProviderProps {
  dir: string;
  disabled?: boolean;
  children: ReactNode;
}
