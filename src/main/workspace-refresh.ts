import { WorkspaceFiles } from './workspace-files.js';
import { join } from 'node:path';
import { canonicalPath, samePath } from '../core/fs-path.js';
import { probeDirectory, readSelectedDirectory, isProbeError } from '../core/fs-probe.js';
import { scanRootBatches } from '../core/discovery.js';
import { compareBatches } from '../core/batch-order.js';
import { scanBatch } from '../core/index.js';
import type { Batch } from '../core/types.js';
import type { BatchView, WorkspaceView } from '../shared/api.js';
import { ensureClaim, migrateClaimSubmission } from './claim-store.js';
import { defaultClaim } from '../core/domain/claim.js';
import { buildRejectedInfo, readRejectedReasons } from '../core/rejected.js';
import { assertDirectory } from './paths.js';
import { findLaborDirectories } from '../core/labor/scan.js';
import { readReplacementHistory } from './correction/store.js';
import { manualTasks } from './workspace-manual.js';

export class WorkspaceRefresh extends WorkspaceFiles {
  async refresh(dir?: string, cached = false): Promise<WorkspaceView> {
    if (dir) dir = canonicalPath(dir);
    if (!this.location) throw new Error('请先选择文件夹');
    const { rules } = await this.store.settings();
    const location = this.location;
    await readSelectedDirectory(location.dir);
    await assertDirectory(location.dir);
    const root = location.contextRoot;
    const isLabor =
      dir !== undefined && this.laborService.views.some((l) => samePath(l.report.dir, dir));
    let scans: Map<string, Batch>;
    let rejected = this.rejected;
    if (cached) {
      scans = new Map(this.scans);
    } else if (dir !== undefined) {
      scans = new Map(this.scans);
      if (!isLabor) {
        this.batch(dir);
        scans.set(dir, await scanBatch(dir, { config: rules }));
      }
    } else {
      const entries = root ? ((await probeDirectory(root)) ?? []) : [];
      scans = new Map();
      if (root) {
        for (const batch of await scanRootBatches(root, rules)) scans.set(batch.dir, batch);
      } else if (!location.laborDir) {
        const directory = location.referenceDir ?? location.dir;
        await assertDirectory(directory);
        scans.set(directory, await scanBatch(directory, { config: rules }));
      }
      rejected = null;
      if (root && entries.some((e) => e.isDirectory() && e.name === '无法报销费用')) {
        try {
          rejected = await scanBatch(join(root, '无法报销费用'), { config: rules });
        } catch (error) {
          if (!isProbeError(error)) throw error;
        }
      }
      if (!root && location.referenceDir) {
        rejected = scans.get(location.referenceDir)!;
        scans.delete(location.referenceDir);
      }
    }
    const laborDirs =
      dir !== undefined || cached
        ? this.laborService.views.map((l) => l.report.dir)
        : location.referenceDir
          ? []
          : root
            ? await findLaborDirectories(root, rules)
            : location.laborDir
              ? [location.laborDir]
              : await findLaborDirectories(location.dir, rules, 'batch');
    const labor = await this.laborService.refresh(
      laborDirs,
      rules,
      dir,
      cached || (dir !== undefined && !isLabor),
    );
    let history = await this.store.history();
    const batches = [...scans.values()].sort(compareBatches);
    for (const batch of batches) {
      batch.claim = await ensureClaim(batch.dir);
      const previous = history.find((h) => samePath(h.batchDir, batch.dir) && !h.claimId);
      if (previous) {
        if (batch.claim.state === 'draft')
          batch.claim = await migrateClaimSubmission(batch.dir, previous.markedAt);
        await this.store.bindHistoryClaim(batch.dir, batch.claim.id);
      }
    }
    history = await this.store.history();
    this.registryView = await this.registryStore.rebuild(batches);
    const rejectedNumbers = new Set(rejected?.invoices.map((i) => i.number));
    const rejectedInfo = rejected
      ? buildRejectedInfo(rejected, rules, await readRejectedReasons(rejected.dir))
      : new Map();
    const makeView = async (scanned: Batch, readOnly = false): Promise<BatchView> => {
      const { batch, report } = await this.checkScanned(
        scanned,
        scanned.dir,
        rules,
        batches,
        history,
        { rejectedNumbers, rejectedInfo },
        readOnly,
      );
      const claim = batch.claim ?? defaultClaim('read-only-reference', new Date().toISOString());
      return {
        claim,
        waived: report.findings.filter((f) => f.resolution === 'waived').length,
        batch,
        report,
        markedAt: [...claim.transitions].reverse().find((t) => t.to === 'submitted')?.at ?? null,
        outputs: await this.outputs(batch.dir),
        manualTasks: manualTasks(batch, rules.exchangeRateType),
        ...(!readOnly ? { replacements: await readReplacementHistory(batch.dir) } : {}),
        readOnly,
        ...(readOnly ? { rejectedInfo: [...rejectedInfo.values()] } : {}),
      };
    };
    const views: BatchView[] = [];
    for (const batch of batches) views.push(await makeView(batch));
    const reference = rejected ? await makeView(rejected, true) : null;
    const selection = this.view?.selectedBatchDir ?? null;
    this.view = {
      kind: root ? 'root' : 'batch',
      dir: root ?? location.referenceDir ?? location.dir,
      openedDir: location.dir,
      batches: views,
      rejected: reference,
      labor,
      selectedBatchDir:
        selection &&
        (scans.has(selection) ||
          samePath(rejected?.dir, selection) ||
          labor.some((l) => samePath(l.report.dir, selection)))
          ? selection
          : null,
    };
    this.scans = scans;
    this.rejected = rejected;
    return this.view;
  }
}
