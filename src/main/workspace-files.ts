import { WorkspaceState } from './workspace-state.js';
import { dirname, join } from 'node:path';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { samePath } from '../core/fs-path.js';
import { isProbeError } from '../core/fs-probe.js';
import type { Batch, CheckContext } from '../core/types.js';
import type { Submission } from '../shared/api.js';
import type { RuleConfig } from '../core/rules/config.js';
import { checkBatch, buildReport } from '../core/index.js';
import { submittedNumbers } from '../core/domain/registry.js';
import { batchFile, manualPath, outputDirectory } from './paths.js';
import { readRateCaptures } from './rate-capture.js';
import { groupName } from '../core/group.js';

export abstract class WorkspaceFiles extends WorkspaceState {
  protected async checkScanned(
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
      ...(batches.find((b) => samePath(b.dir, identityDir))?.claim
        ? { claim: batches.find((b) => samePath(b.dir, identityDir))!.claim }
        : {}),
      attachments: [
        ...scanned.attachments,
        ...(await this.rateFiles(scanned, rules.exchangeRateType)),
      ],
    };
    const result = checkBatch(batch, rules, {
      otherBatches: batches.filter((b) => !samePath(b.dir, identityDir)),
      submittedHistory: new Set([
        ...submittedNumbers(this.registryView, batch.claim?.id ?? ''),
        ...history
          .filter(
            (h) =>
              !samePath(h.batchDir, identityDir) && (!batch.claim || h.claimId !== batch.claim.id),
          )
          .flatMap((h) => h.numbers),
      ]),
      ...(readOnly ? {} : context),
    });
    const waived = new Set(batch.claim?.waivers.map((w) => w.findingId));
    result.findings = result.findings.map((finding) =>
      waived.has(finding.id) ? { ...finding, resolution: 'waived' } : finding,
    );
    for (const group of result.groups)
      for (const requirement of group.requirements)
        requirement.foundFiles = [
          ...new Map(requirement.foundFiles.map((f) => [f.path, f])).values(),
        ];
    for (const finding of result.findings) finding.files = [...new Set(finding.files)];
    return { batch, report: buildReport(result) };
  }
  protected async rateFiles(batch: Batch, rateType: string) {
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
  protected async outputs(dir: string): Promise<string[]> {
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
  async allowedFile(input: string) {
    if (this.view && samePath(input, join(this.view.dir, '_预检/台账.md')))
      return realpath(await batchFile(this.view.dir, '_预检/台账.md'));
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
}
