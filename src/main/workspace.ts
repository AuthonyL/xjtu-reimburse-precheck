import { lstat } from 'node:fs/promises';
import { canonicalPath, samePath } from '../core/fs-path.js';
import type { WorkspaceView, WorkspaceRestore } from '../shared/api.js';
import { detectWorkspace } from './paths.js';
import { LaborService } from './labor-service.js';
import { WorkspaceCorrections } from './workspace-corrections.js';
export { manualTasks } from './workspace-manual.js';

export class WorkspaceService extends WorkspaceCorrections {
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
}
