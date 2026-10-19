import { canonicalPath, samePath } from '../core/fs-path.js';
import { isProbeError, probeDirectory, readSelectedDirectory } from '../core/fs-probe.js';
import { scanRootBatches } from '../core/discovery.js';
import { compareBatches } from '../core/batch-order.js';
import { dirname, join } from 'node:path';
import { readdir, lstat, realpath } from 'node:fs/promises';
import {
  scanBatch,
  checkBatch,
  buildReport,
  exportInventory,
  exportHighValue,
  exportMarkdown,
} from '../core/index.js';
import type { AttachmentType, Batch, ManualEntry, CheckContext } from '../core/types.js';
import type {
  BatchView,
  ManualTask,
  WorkspaceView,
  WorkspaceRestore,
  Submission,
} from '../shared/api.js';
import { DesktopStore } from './store.js';
import {
  batchFile,
  detectWorkspace,
  manualPath,
  outputDirectory,
  assertDirectory,
  type WorkspaceLocation,
} from './paths.js';
import { saveAttachment, saveManualEntry } from './manual-store.js';
import { SerialQueue } from './json-store.js';
import { readRateCaptures } from './rate-capture.js';
import {
  buildRejectedInfo,
  readRejectedReasons,
  validateRejectedReasons,
  REASONS_RELATIVE_PATH,
} from '../core/rejected.js';
import { writeJson } from './json-store.js';
import { groupName } from '../core/group.js';
import { LaborService } from './labor-service.js';
import { findLaborDirectories } from '../core/labor/scan.js';
import type { LaborManualEntry } from '../core/labor/types.js';

import type { RuleConfig } from '../core/rules/config.js';
import { checkLabor } from '../core/labor/engine.js';
import { scanLaborDirectory } from '../core/labor/scan.js';
import { createHash } from 'node:crypto';
import { CorrectionService } from './correction/service.js';
import type { CorrectionContext, CorrectionAnalysis } from './correction/context.js';
import type { CorrectionRequest } from '../core/correction/types.js';
import { directoryFingerprint } from './correction/files.js';
import { readReplacementHistory } from './correction/store.js';

export function manualTasks(batch: Batch, rateType: string): ManualTask[] {
  const tasks: ManualTask[] = [];
  for (const group of batch.groups) {
    const invoices = batch.invoices.filter((i) => group.invoiceNumbers.includes(i.number));
    for (const invoice of invoices.filter((i) => i.kind !== 'domestic' || i.currency !== 'CNY')) {
      const saved = batch.manual.entries.find(
        (e, n) =>
          e.number === invoice.number ||
          invoice.sources.some((s) => s.relativePath === e.sourceFile) ||
          (!e.sourceFile && !e.number && invoice.number === `manual:${e.group}:${n + 1}`),
      );
      const source = invoice.sources.find((s) => s.format !== 'manual');
      tasks.push({
        key: invoice.number,
        group: group.name,
        label: invoice.seller.name || invoice.number,
        entry: {
          group: group.name,
          currency: invoice.currency,
          amount: invoice.total,
          paymentDate: invoice.date,
          exchangeRateType: rateType,
          ...saved,
          number: saved ? saved.number : invoice.number,
          sourceFile: saved ? saved.sourceFile : source?.relativePath,
        },
        pending:
          !invoice.date ||
          (invoice.currency !== 'CNY' &&
            (!saved?.exchangeRate ||
              saved.currency !== invoice.currency ||
              saved.paymentDate !== invoice.date ||
              (!!saved.exchangeRateType && saved.exchangeRateType !== rateType))),
      });
    }
    const unknown = group.flags.ai
      ? batch.attachments.filter(
          (a) =>
            a.type === 'unnamed' &&
            (group.name === '根目录'
              ? !a.relativePath.includes('/')
              : a.relativePath.startsWith(group.name + '/')),
        )
      : [];
    for (const file of unknown)
      tasks.push({
        key: 'file:' + file.relativePath,
        group: group.name,
        label: file.relativePath,
        entry: {
          group: group.name,
          sourceFile: file.relativePath,
          currency: 'USD',
          exchangeRateType: rateType,
        },
        pending: true,
      });
    if (group.flags.ai && !invoices.length && !unknown.length)
      tasks.push({
        key: 'group:' + group.name,
        group: group.name,
        label: '未读取到收据，请填实际支付记录',
        entry: {
          group: group.name,
          number: 'manual:desktop:' + group.name,
          currency: 'USD',
          exchangeRateType: rateType,
        },
        pending: true,
      });
  }
  return tasks;
}

export class WorkspaceService {
  private location: WorkspaceLocation | null = null;
  private view: WorkspaceView | null = null;
  private scans = new Map<string, Batch>();
  private rejected: Batch | null = null;
  private laborService = new LaborService();
  readonly queue = new SerialQueue();
  private corrections = new CorrectionService((dir) => this.correctionContext(dir));
  constructor(readonly store: DesktopStore) {}

  currentWorkspace(): WorkspaceView | null {
    return this.view;
  }

  async restore(): Promise<WorkspaceRestore> {
    if (this.view) return { workspace: this.view, message: null };
    const session = await this.store.session();
    // Before workspace.json existed, the last folder was only kept in the recent list.
    const openedDir =
      session.openedDir ??
      ((await this.store.hasSession()) ? null : ((await this.store.recent())[0] ?? null));
    if (!openedDir) return { workspace: null, message: null };
    try {
      if (!(await lstat(openedDir)).isDirectory())
        return { workspace: null, message: '上次的文件夹已不存在：' + openedDir };
      return {
        workspace: await this.open(openedDir, session.selectedBatchDir),
        message: null,
      };
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
        return { workspace: null, message: '上次的文件夹已不存在：' + openedDir };
      return {
        workspace: null,
        message: `无法恢复上次的工作区：${openedDir}。${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  async open(dir: string, selection?: string | null): Promise<WorkspaceView> {
    if (selection) selection = canonicalPath(selection);
    const previous = {
      location: this.location,
      view: this.view,
      scans: this.scans,
      rejected: this.rejected,
      laborService: this.laborService,
    };
    this.location = await detectWorkspace(dir, (await this.store.settings()).rules);
    this.laborService = new LaborService();
    this.scans = new Map();
    this.rejected = null;
    this.view = null;
    try {
      const result = await this.refresh();
      const selected =
        selection === undefined
          ? this.location.kind === 'batch'
            ? (this.location.laborDir ?? this.location.referenceDir ?? this.location.dir)
            : null
          : selection;
      if (
        selected &&
        (this.scans.has(selected) ||
          samePath(result.rejected?.batch.dir, selected) ||
          result.labor?.some((l) => samePath(l.report.dir, selected)))
      )
        result.selectedBatchDir = selected;
      await this.store.addRecent(this.location.dir);
      await this.store.rememberWorkspace(this.location.dir, result.selectedBatchDir);
      return result;
    } catch (error) {
      this.location = previous.location;
      this.view = previous.view;
      this.scans = previous.scans;
      this.rejected = previous.rejected;
      this.laborService = previous.laborService;
      throw error;
    }
  }
  async select(dir: string | null): Promise<void> {
    if (dir) dir = canonicalPath(dir);
    if (!this.location || !this.view) throw new Error('请先选择文件夹');
    if (
      dir !== null &&
      !this.view.batches.some((b) => samePath(b.batch.dir, dir)) &&
      !samePath(this.view.rejected?.batch.dir, dir) &&
      !this.view.labor?.some((l) => samePath(l.report.dir, dir))
    )
      throw new Error('批次不属于当前打开的工作区');
    await this.store.rememberWorkspace(this.location.dir, dir);
    this.view.selectedBatchDir = dir;
  }
  batch(dir: string): BatchView {
    if (samePath(this.view?.rejected?.batch.dir, dir))
      throw new Error('无法报销费用为只读参考目录');
    const batch = this.view?.batches.find((v) => samePath(v.batch.dir, dir));
    if (!batch) throw new Error('批次不属于当前打开的工作区，请重新打开');
    return batch;
  }
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
    const history = await this.store.history();
    const batches = [...scans.values()].sort(compareBatches);
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
      return {
        batch,
        report,
        markedAt: history.find((h) => samePath(h.batchDir, batch.dir))?.markedAt ?? null,
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
  private async checkScanned(
    scanned: Batch,
    identityDir: string,
    rules: RuleConfig,
    batches: Batch[],
    history: Submission[],
    context: Pick<CheckContext, 'rejectedNumbers' | 'rejectedInfo'>,
    readOnly = false,
  ) {
    const batch = {
      ...scanned,
      attachments: [
        ...scanned.attachments,
        ...(await this.rateFiles(scanned, rules.exchangeRateType)),
      ],
    };
    const result = checkBatch(batch, rules, {
      otherBatches: batches.filter((b) => !samePath(b.dir, identityDir)),
      submittedHistory: new Set(
        history.filter((h) => !samePath(h.batchDir, identityDir)).flatMap((h) => h.numbers),
      ),
      ...(readOnly ? {} : context),
    });
    for (const group of result.groups)
      for (const requirement of group.requirements)
        requirement.foundFiles = [
          ...new Map(requirement.foundFiles.map((f) => [f.path, f])).values(),
        ];
    for (const finding of result.findings) finding.files = [...new Set(finding.files)];
    return { batch, report: buildReport(result) };
  }
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
  async saveRejectedReason(number: string, reason: string): Promise<WorkspaceView> {
    const reference = this.rejected;
    const invoice = reference?.invoices.find((i) => i.number === number);
    if (!reference || !invoice) throw new Error('只能给当前拒票目录中已识别的发票记录原因');
    await assertDirectory(reference.dir);
    const file = await batchFile(reference.dir, REASONS_RELATIVE_PATH, true);
    const reasons = await readRejectedReasons(reference.dir);
    const validated = validateRejectedReasons({
      ...reasons,
      [number]: {
        number,
        reason,
        recordedAt: new Date().toISOString(),
        file: invoice.sources[0]!.relativePath,
      },
    });
    await outputDirectory(reference.dir);
    await writeJson(file, validated);
    return this.refresh(undefined, true);
  }
  private async rateFiles(batch: Batch, rateType: string) {
    const raw = await readRateCaptures(batch.dir);
    const files = [];
    for (const row of raw) {
      if (
        typeof row.file !== 'string' ||
        !/^_预检\/汇率-\d{4}-\d{2}-\d{2}-[A-Z]{3}\.png$/.test(row.file)
      )
        throw new Error('汇率截图索引路径不正确');
      const file = await batchFile(batch.dir, row.file, true);
      try {
        if (!(await lstat(file)).isFile()) continue;
        const group = batch.groups.find((g) => g.name === row.group);
        const matching = batch.manual.entries.some(
          (e) =>
            e.group === row.group &&
            e.paymentDate === row.date &&
            e.currency === row.currency &&
            row.rateType === rateType &&
            (!e.exchangeRateType || e.exchangeRateType === row.rateType) &&
            e.exchangeRate !== undefined &&
            Math.abs(e.exchangeRate / (e.rateBase ?? 1) - row.rate) < 1e-12,
        );
        if (group && matching) {
          const directories = new Set(
            batch.invoices
              .filter(
                (i) =>
                  group.invoiceNumbers.includes(i.number) &&
                  i.date === row.date &&
                  i.currency === row.currency,
              )
              .flatMap((i) =>
                i.sources
                  .filter((s) => groupName(batch.dir, s.path) === group.name)
                  .map((s) => dirname(s.path)),
              ),
          );
          if (!directories.size) directories.add(group.dir);
          for (const directory of directories)
            files.push({
              type: 'exchangeRate' as const,
              path: file,
              relativePath: row.file,
              directory,
            });
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    return files;
  }
  private async outputs(dir: string): Promise<string[]> {
    const output = await batchFile(dir, '_预检', true);
    try {
      const names = await readdir(output, { withFileTypes: true });
      return names
        .filter(
          (e) =>
            (e.isFile() &&
              ['入库登记清单.xlsx', '高值材料明细.xlsx', '汇总.md'].includes(e.name)) ||
            (e.isFile() && /^汇率-.*\.png$/.test(e.name)),
        )
        .map((e) => join(output, e.name));
    } catch (e) {
      if (isProbeError(e)) return [];
      throw e;
    }
  }
  async confirm(dir: string, file: string, type: AttachmentType) {
    const batch = this.batch(dir).batch;
    if (!batch.attachments.some((a) => a.relativePath === file))
      throw new Error('只能确认当前批次已扫描的附件');
    await saveAttachment(dir, file, type);
    return this.refresh(dir);
  }
  async manual(dir: string, entry: ManualEntry) {
    const batch = this.batch(dir).batch;
    if (!batch.groups.some((g) => g.name === entry.group)) throw new Error('手填组不存在');
    if (
      entry.sourceFile &&
      ![
        ...batch.attachments,
        ...batch.unidentified,
        ...batch.invoices.flatMap((i) => i.sources),
      ].some((s) => s.relativePath === entry.sourceFile)
    )
      throw new Error('手填来源未在当前批次中找到');
    await saveManualEntry(dir, entry);
    return this.refresh(dir);
  }
  async export(dir: string) {
    const batch = this.batch(dir);
    const target = await outputDirectory(dir);
    for (const file of ['入库登记清单.xlsx', '高值材料明细.xlsx', '汇总.md'])
      await batchFile(dir, '_预检/' + file, true);
    const { rules } = await this.store.settings();
    await exportInventory(batch.report, target);
    await exportHighValue(batch.report, rules, target);
    await exportMarkdown(batch.report, target);
    return this.refresh(dir);
  }
  async mark(dir: string, marked: boolean) {
    const { batch } = this.batch(dir);
    if (marked)
      await this.store.mark(
        dir,
        batch.invoices.map((i) => i.number),
      );
    else await this.store.unmark(dir);
    return this.refresh(dir);
  }
  async allowedFile(input: string) {
    const laborFile = await this.laborService.allowedFile(input);
    if (laborFile) return laborFile;
    for (const view of [
      ...(this.view?.batches ?? []),
      ...(this.view?.rejected ? [this.view.rejected] : []),
    ]) {
      const allowed = [
        ...view.batch.invoices.flatMap((i) => i.sources.map((s) => s.path)),
        ...view.batch.attachments.map((a) => a.path),
        ...view.outputs,
        ...view.batch.unidentified.map((f) => f.path),
      ];
      if (!allowed.some((file) => samePath(file, input))) continue;
      const file = await batchFile(view.batch.dir, manualPath(view.batch.dir, input));
      const canonical = await realpath(file);
      manualPath(view.batch.dir, canonical);
      return canonical;
    }
    throw new Error('文件不属于当前批次');
  }
  async output(dir: string) {
    if (!this.laborService.views.some((l) => samePath(l.report.dir, dir))) this.batch(dir);
    return outputDirectory(dir);
  }
  async saveLabor(dir: string, file: string, entry: LaborManualEntry): Promise<WorkspaceView> {
    await this.laborService.save(dir, file, entry);
    return this.refresh(dir);
  }
  async exportLabor(dir: string, file: string, entry?: LaborManualEntry): Promise<WorkspaceView> {
    if (entry !== undefined) await this.laborService.save(dir, file, entry);
    await this.laborService.export(dir, file, (await this.store.settings()).rules);
    return this.refresh(dir);
  }
}
