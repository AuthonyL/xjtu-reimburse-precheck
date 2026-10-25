import { WorkspaceActions } from './workspace-actions.js';
import { createHash } from 'node:crypto';
import { canonicalPath, samePath } from '../core/fs-path.js';
import { scanBatch } from '../core/index.js';
import { buildRejectedInfo, readRejectedReasons } from '../core/rejected.js';
import { scanLaborDirectory } from '../core/labor/scan.js';
import { checkLabor } from '../core/labor/engine.js';
import { CorrectionService } from './correction/service.js';
import type { CorrectionContext, CorrectionAnalysis } from './correction/context.js';
import type { CorrectionRequest } from '../core/correction/types.js';
import { directoryFingerprint } from './correction/files.js';

export class WorkspaceCorrections extends WorkspaceActions {
  private corrections = new CorrectionService((dir) => this.correctionContext(dir));
  private async correctionContext(dir: string): Promise<CorrectionContext> {
    dir = canonicalPath(dir);
    await this.refresh();
    const view = this.view!;
    const batch = view.batches.find((b) => samePath(b.batch.dir, dir));
    const labor = view.labor?.find((l) => samePath(l.report.dir, dir));
    if (!batch && !labor) throw new Error('只能检查当前批次或劳务目录，拒票目录不提供放入入口');
    const settings = await this.store.settings();
    const history = await this.store.history();
    const rules = settings.rules;
    const analysis: CorrectionAnalysis = batch
      ? { kind: 'batch', batch: batch.batch, report: batch.report, findings: batch.report.findings }
      : {
          kind: 'labor',
          labor: labor!.report,
          findings: [
            ...labor!.report.diagnostics,
            ...labor!.report.entries.flatMap((e) => e.findings),
          ],
        };
    const dirs = [
      ...view.batches.map((b) => b.batch.dir),
      ...(view.labor ?? []).map((l) => l.report.dir),
      ...(view.rejected ? [view.rejected.batch.dir] : []),
    ];
    const signature = createHash('sha256')
      .update(JSON.stringify([await directoryFingerprint(dirs), settings, history]))
      .digest('hex');
    const batches = view.batches.map((b) => b.batch);
    const rejectedNumbers = new Set(this.rejected?.invoices.map((i) => i.number));
    const rejectedInfo = this.rejected
      ? buildRejectedInfo(this.rejected, rules, await readRejectedReasons(this.rejected.dir))
      : new Map();
    return {
      dir,
      config: rules,
      analysis,
      signature,
      examine: async (copy) => {
        if (labor) {
          const report = checkLabor(await scanLaborDirectory(copy, rules), rules);
          return {
            kind: 'labor',
            labor: report,
            findings: [...report.diagnostics, ...report.entries.flatMap((e) => e.findings)],
          };
        }
        const scanned = await scanBatch(copy, { config: rules });
        scanned.id = batch!.batch.id;
        const checked = await this.checkScanned(scanned, dir, rules, batches, history, {
          rejectedNumbers,
          rejectedInfo,
        });
        return { kind: 'batch', ...checked, findings: checked.report.findings };
      },
    };
  }
  correctionTargets(dir: string) {
    return this.corrections.targets(dir);
  }
  previewCorrection(request: CorrectionRequest) {
    return this.corrections.preview(request);
  }
  async confirmCorrection(token: string) {
    const dir = await this.corrections.confirm(token);
    return this.refresh(dir);
  }
  cancelCorrection(token: string) {
    return this.corrections.cancel(token);
  }
  async undoCorrection(dir: string, expectedId?: string) {
    await this.corrections.undo(dir, expectedId);
    return this.refresh(dir);
  }
}
