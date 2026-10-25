import { WorkspaceRefresh } from './workspace-refresh.js';
import type { AttachmentType, ManualEntry } from '../core/types.js';
import type { WorkspaceView } from '../shared/api.js';
import type { ClaimState } from '../core/domain/claim.js';
import type { LaborManualEntry } from '../core/labor/types.js';
import {
  transitionClaim,
  updateClaimMeta,
  setWaiver,
  removeWaiver,
  type ClaimMeta,
} from './claim-store.js';
import { buildInbox } from '../core/inbox.js';
import { exportInventory, exportHighValue, exportMarkdown } from '../core/index.js';
import {
  readRejectedReasons,
  validateRejectedReasons,
  REASONS_RELATIVE_PATH,
} from '../core/rejected.js';
import { batchFile, outputDirectory, assertDirectory } from './paths.js';
import { saveAttachment, saveManualEntry, ignoreFile, unignoreFile } from './manual-store.js';
import { writeJson } from './json-store.js';
import { writeLedger } from './ledger-export.js';

export class WorkspaceActions extends WorkspaceRefresh {
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
  async confirm(dir: string, file: string, type: AttachmentType) {
    const batch = this.batch(dir).batch;
    if (![...batch.attachments, ...batch.unidentified].some((a) => a.relativePath === file))
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
    await exportMarkdown(batch.report, target, batch.claim);
    return this.refresh(dir);
  }
  async transitionClaim(dir: string, to: ClaimState, note?: string) {
    const { batch } = this.batch(dir);
    const claim = await transitionClaim(batch.dir, to, note);
    if (to === 'submitted')
      await this.store.mark(
        batch.dir,
        batch.invoices.map((i) => i.number),
        claim.id,
        claim.transitions.at(-1)!.at,
      );
    else if (to !== 'reimbursed') await this.store.unmark(batch.dir, claim.id);
    return this.refresh(undefined, true);
  }
  async mark(dir: string, marked = true) {
    return this.transitionClaim(dir, marked ? 'submitted' : 'draft');
  }
  async updateClaim(dir: string, meta: ClaimMeta) {
    const { batch } = this.batch(dir);
    await updateClaimMeta(batch.dir, meta);
    return this.refresh(undefined, true);
  }
  async waiveFinding(dir: string, findingId: string, reason: string) {
    const view = this.batch(dir);
    if (!view.report.findings.some((f) => f.id === findingId))
      throw new Error('问题不属于当前批次');
    await setWaiver(view.batch.dir, findingId, reason);
    return this.refresh(undefined, true);
  }
  async unwaiveFinding(dir: string, findingId: string) {
    const view = this.batch(dir);
    await removeWaiver(view.batch.dir, findingId);
    return this.refresh(undefined, true);
  }
  async inbox() {
    return buildInbox(
      this.view?.batches.map((b) => b.batch) ?? [],
      (await this.store.settings()).rules,
    );
  }
  async ignoreFile(dir: string, relativePath: string) {
    const { batch } = this.batch(dir);
    if (
      ![...batch.unidentified, ...batch.attachments.filter((a) => a.type === 'unnamed')].some(
        (f) => f.relativePath === relativePath,
      )
    )
      throw new Error('只能忽略当前批次的未识别文件');
    await ignoreFile(batch.dir, relativePath);
    return this.refresh(batch.dir);
  }
  async unignoreFile(dir: string, relativePath: string) {
    const { batch } = this.batch(dir);
    await unignoreFile(batch.dir, relativePath);
    return this.refresh(batch.dir);
  }
  registry() {
    return this.registryStore.read();
  }
  async exportLedger(): Promise<string> {
    return writeLedger(this.view, await this.registry());
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
