import type { Batch, Finding, Report } from '../../core/types.js';
import type { LaborReport } from '../../core/labor/types.js';
import type { RuleConfig } from '../../core/rules/config.js';
export interface CorrectionAnalysis {
  kind: 'batch' | 'labor';
  findings: Finding[];
  batch?: Batch;
  report?: Report;
  labor?: LaborReport;
}
export interface CorrectionContext {
  dir: string;
  config: RuleConfig;
  analysis: CorrectionAnalysis;
  signature: string;
  examine(copyDir: string): Promise<CorrectionAnalysis>;
}
