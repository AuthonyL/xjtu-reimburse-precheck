import { createContext } from 'react';
import { relativeProblemFile } from '../../../core/correction/problems.js';
import type { Finding } from '../../../core/types.js';
import type { FeedbackState } from '../../../shared/feedback.js';
export const relativeDirectory = (root: string | undefined | null, directory: string) =>
  !root || root === directory ? '.' : relativeProblemFile(root, directory);
export const Context = createContext<{
  state: FeedbackState;
  reload: () => Promise<void>;
  mark?: (finding: Finding, directory: string) => void;
}>({ state: { records: [], workspaceKey: null }, reload: async () => {} });
