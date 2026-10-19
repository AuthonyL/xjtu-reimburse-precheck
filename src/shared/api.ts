import type {
  FeedbackState,
  FeedbackInput,
  FeedbackPreview,
  RuleVersionInfo,
  UpgradeChoices,
  RuleUpgradeResult,
} from './feedback.js';
import type { AttachmentType, Batch, ManualEntry, Report, RejectedInfo } from '../core/types.js';
import type { RuleConfig } from '../core/rules/config.js';
import type { LaborManualEntry, LaborReport } from '../core/labor/types.js';
import type {
  ReplacementHistory,
  CorrectionTarget,
  CorrectionRequest,
  CorrectionPreview,
} from '../core/correction/types.js';

export interface AppSettings {
  rules: RuleConfig;
  bocUrl: string;
}
export interface Submission {
  batchDir: string;
  batchId: string;
  markedAt: string;
  numbers: string[];
}
export interface BatchView {
  replacements?: ReplacementHistory;
  batch: Batch;
  report: Report;
  markedAt: string | null;
  outputs: string[];
  manualTasks: ManualTask[];
  readOnly?: boolean;
  rejectedInfo?: RejectedInfo[];
}
export interface ManualTask {
  key: string;
  group: string;
  label: string;
  entry: Partial<ManualEntry> & { group: string };
  pending: boolean;
}
export interface WorkspaceView {
  labor?: LaborView[];
  kind: 'root' | 'batch';
  dir: string;
  batches: BatchView[];
  openedDir: string;
  selectedBatchDir: string | null;
  rejected: BatchView | null;
}
export interface LaborView {
  replacements?: ReplacementHistory;
  report: LaborReport;
  outputs: string[];
}
export interface WorkspaceSession {
  openedDir: string | null;
  selectedBatchDir: string | null;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}
export type SidebarLayout = Pick<WorkspaceSession, 'sidebarWidth' | 'sidebarCollapsed'>;
export interface WorkspaceRestore {
  workspace: WorkspaceView | null;
  message: string | null;
}
export interface Bootstrap {
  ruleVersion?: RuleVersionInfo;
  settings: AppSettings;
  recent: string[];
  userData: string;
  session: WorkspaceSession;
  restored: WorkspaceRestore;
}
export interface BocRequest {
  batchDir: string;
  entry: ManualEntry;
}
export interface BocSelection {
  value: number;
  date: string;
  currencyName: string;
  rateType: string;
}
export type AppEvent =
  | { type: 'rates-saved'; workspace: WorkspaceView; file: string }
  | { type: 'boc-error'; message: string };
export interface DesktopApi {
  feedbackState(): Promise<FeedbackState>;
  markFeedback(input: FeedbackInput): Promise<FeedbackState>;
  deleteFeedback(id: string): Promise<FeedbackState>;
  previewFeedback(includeOriginals: boolean): Promise<FeedbackPreview>;
  exportFeedback(token: string): Promise<string | null>;
  cancelFeedback(): Promise<void>;
  ruleVersion(): Promise<RuleVersionInfo>;
  resolveRuleUpgrade(choices: UpgradeChoices): Promise<RuleUpgradeResult>;
  correctionTargets(dir: string): Promise<CorrectionTarget[]>;
  chooseCorrectionFile(): Promise<string | null>;
  droppedFilePath(file: File): string;
  previewCorrection(request: CorrectionRequest): Promise<CorrectionPreview>;
  confirmCorrection(token: string): Promise<WorkspaceView>;
  cancelCorrection(token: string): Promise<void>;
  undoCorrection(dir: string, expectedId?: string): Promise<WorkspaceView>;
  bootstrap(): Promise<Bootstrap>;
  chooseFolder(): Promise<WorkspaceView | null>;
  openFolder(dir: string): Promise<WorkspaceView>;
  droppedFolder(file: File): Promise<WorkspaceView>;
  recheck(batchDir?: string): Promise<WorkspaceView>;
  selectBatch(batchDir: string | null): Promise<void>;
  saveLayout(layout: Partial<SidebarLayout>): Promise<SidebarLayout>;
  confirmAttachment(
    batchDir: string,
    relativePath: string,
    type: AttachmentType,
  ): Promise<WorkspaceView>;
  saveRejectedReason(number: string, reason: string): Promise<WorkspaceView>;
  saveLabor(dir: string, relativePath: string, entry: LaborManualEntry): Promise<WorkspaceView>;
  exportLabor(dir: string, relativePath: string, entry?: LaborManualEntry): Promise<WorkspaceView>;
  copyText(text: string): Promise<void>;
  saveManual(batchDir: string, entry: ManualEntry): Promise<WorkspaceView>;
  exportBatch(batchDir: string): Promise<WorkspaceView>;
  openFile(file: string): Promise<void>;
  revealFile(file: string): Promise<void>;
  openOutput(batchDir: string): Promise<void>;
  markSubmitted(batchDir: string, marked: boolean): Promise<WorkspaceView>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  resetSettings(): Promise<AppSettings>;
  importRules(): Promise<AppSettings | null>;
  exportRules(settings: AppSettings): Promise<string | null>;
  openBoc(request: BocRequest): Promise<void>;
  onEvent(listener: (event: AppEvent) => void): () => void;
}

export const channels = {
  feedbackState: 'app:feedback-state',
  markFeedback: 'app:mark-feedback',
  deleteFeedback: 'app:delete-feedback',
  previewFeedback: 'app:preview-feedback',
  exportFeedback: 'app:export-feedback',
  cancelFeedback: 'app:cancel-feedback',
  ruleVersion: 'app:rule-version',
  resolveRuleUpgrade: 'app:resolve-rule-upgrade',
  correctionTargets: 'app:correction-targets',
  chooseCorrectionFile: 'app:choose-correction-file',
  previewCorrection: 'app:preview-correction',
  confirmCorrection: 'app:confirm-correction',
  cancelCorrection: 'app:cancel-correction',
  undoCorrection: 'app:undo-correction',
  bootstrap: 'app:bootstrap',
  chooseFolder: 'app:choose-folder',
  openFolder: 'app:open-folder',
  recheck: 'app:recheck',
  selectBatch: 'app:select-batch',
  saveLayout: 'app:save-layout',
  confirmAttachment: 'app:confirm-attachment',
  saveManual: 'app:save-manual',
  saveRejectedReason: 'app:save-rejected-reason',
  saveLabor: 'app:save-labor',
  exportLabor: 'app:export-labor',
  copyText: 'app:copy-text',
  exportBatch: 'app:export',
  openFile: 'app:open-file',
  revealFile: 'app:reveal-file',
  openOutput: 'app:open-output',
  markSubmitted: 'app:mark-submitted',
  getSettings: 'app:get-settings',
  saveSettings: 'app:save-settings',
  resetSettings: 'app:reset-settings',
  importRules: 'app:import-rules',
  exportRules: 'app:export-rules',
  openBoc: 'app:open-boc',
  event: 'app:event',
} as const;
