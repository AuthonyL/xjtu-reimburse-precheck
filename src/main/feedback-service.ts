import { samePath, pathWithin } from '../core/fs-path.js';
import { basename, resolve } from 'node:path';
import { writeFile, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DEFAULT_BOC_URL } from './store.js';
import { FeedbackStore } from './feedback-store.js';
import {
  buildFeedbackBundle,
  workspaceIdentity,
  relativeFile,
  invoiceSummary,
  type FeedbackBundle,
} from '../core/feedback/bundle.js';
import { createRedactionContext } from '../core/feedback/redact.js';
import { hashConfig } from '../core/feedback/version.js';
import {
  feedbackProblemKey,
  type FeedbackInput,
  type FeedbackPreview,
  type FeedbackState,
} from '../shared/feedback.js';
import type { WorkspaceService } from './workspace.js';
export class FeedbackService {
  private preview: { token: string; bundle: FeedbackBundle; workspaceKey: string } | null = null;
  constructor(
    readonly store: FeedbackStore,
    readonly workspace: WorkspaceService,
    readonly appVersion: string,
  ) {}
  private view() {
    const v = this.workspace.currentWorkspace();
    if (!v) throw new Error('请先打开工作区');
    return v;
  }
  async state(): Promise<FeedbackState> {
    const v = this.workspace.currentWorkspace();
    return {
      records: await this.store.list(),
      workspaceKey: v ? workspaceIdentity(v.dir) : null,
      workspaceDir: v?.dir ?? null,
    };
  }
  async mark(input: FeedbackInput): Promise<FeedbackState> {
    if (
      !input ||
      typeof input.directory !== 'string' ||
      typeof input.problemKey !== 'string' ||
      typeof input.note !== 'string'
    )
      throw new Error('反馈格式错误');
    const v = this.view();
    const batch = v.batches.find((b) => samePath(b.batch.dir, input.directory));
    const labor = v.labor?.find((l) => samePath(l.report.dir, input.directory));
    if (!batch && !labor) throw new Error('只能反馈当前批次或劳务目录的问题');
    const findings = batch?.report.findings ?? [
      ...labor!.report.diagnostics,
      ...labor!.report.entries.flatMap((e) => e.findings),
    ];
    const finding = findings.find(
      (f) => feedbackProblemKey(f, input.directory) === input.problemKey,
    );
    if (!finding) throw new Error('这条问题已变化，请重新检查后反馈');
    const invoices =
      batch?.batch.invoices.filter((i) => finding.invoiceNumbers.includes(i.number)) ?? [];
    await this.store.put({
      people: createRedactionContext({
        names: labor?.report.entries
          .filter((e) => finding.files.includes(e.path))
          .flatMap((e) => [e.fields.name, e.parsed.name].filter((n): n is string => !!n)),
        texts: invoices.map((i) => i.text ?? ''),
      }).names.map((n) => n.name),
      type: input.type,
      note: input.note,
      ruleId: finding.ruleId,
      problemKey: input.problemKey,
      message: finding.message,
      action: finding.action,
      workspaceKey: workspaceIdentity(v.dir),
      workspaceName: basename(v.dir),
      directory: relativeFile(v.dir, input.directory),
      files: finding.files
        .filter((f) => {
          try {
            relativeFile(v.dir, f);
            return true;
          } catch {
            return false;
          }
        })
        .map((f) => relativeFile(v.dir, f)),
      invoices: invoices.map(invoiceSummary),
      configHash: hashConfig((await this.workspace.store.settings()).rules).slice(0, 12),
    });
    return this.state();
  }
  async remove(id: string) {
    if (typeof id !== 'string') throw new Error('反馈编号格式错误');
    await this.store.remove(id);
    return this.state();
  }
  async prepare(includeOriginals: boolean): Promise<FeedbackPreview> {
    if (typeof includeOriginals !== 'boolean') throw new Error('原文件选项格式错误');
    const v = this.view();
    const settings = await this.workspace.store.settings();
    const bundle = await buildFeedbackBundle({
      workspace: {
        rootDir: v.dir,
        batches: v.batches,
        labor: (v.labor ?? []).map((l) => l.report),
        rejected: v.rejected
          ? { batch: v.rejected.batch, info: v.rejected.rejectedInfo ?? [] }
          : null,
      },
      config: settings.rules,
      additionalSettingsDiff:
        settings.bocUrl === DEFAULT_BOC_URL
          ? []
          : [{ path: 'bocUrl', defaultValue: DEFAULT_BOC_URL, currentValue: settings.bocUrl }],
      records: await this.store.list(),
      appVersion: this.appVersion,
      includeOriginals,
    });
    const token = randomUUID();
    this.preview = { token, bundle, workspaceKey: workspaceIdentity(v.dir) };
    return {
      token,
      includeOriginals,
      files: bundle.entries.map((e) => ({ path: e.path, size: e.data.length })),
      samples: bundle.samples,
    };
  }
  async save(token: string, file: string): Promise<string> {
    if (!this.preview || token !== this.preview.token)
      throw new Error('反馈包预览已失效，请重新预览');
    const path = resolve(file);
    const root = this.view().dir;
    if (this.preview.workspaceKey !== workspaceIdentity(root))
      throw new Error('工作区已切换，请重新预览反馈包');
    // Reject both a path spelled inside the workspace and aliases resolving into it.
    if (
      pathWithin(root, path, { realpath: (file) => file }) !== null ||
      pathWithin(root, path) !== null
    )
      throw new Error('请将反馈包保存到工作区以外，避免改动原始资料');
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error('反馈包保存位置不能为符号链接');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await writeFile(path, this.preview.bundle.buffer);
    this.preview = null;
    return path;
  }
  cancel() {
    this.preview = null;
  }
}
