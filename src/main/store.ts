import { canonicalPath, samePath } from '../core/fs-path.js';
import { join, basename } from 'node:path';
import { access } from 'node:fs/promises';
import { loadConfig, type DeepPartial, type RuleConfig } from '../core/rules/config.js';
import { readJson, writeJson, SerialQueue } from './json-store.js';
import type { AppSettings, Submission, WorkspaceSession, SidebarLayout } from '../shared/api.js';
import { clampSidebarWidth, SIDEBAR_DEFAULT } from '../shared/navigation.js';

export const DEFAULT_BOC_URL = 'https://www.boc.cn/sourcedb/whpjSearch/index.html';
export function isBocUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      ['boc.cn', 'bankofchina.com'].some((d) => u.hostname === d || u.hostname.endsWith('.' + d))
    );
  } catch {
    return false;
  }
}
export function validateSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') throw new Error('设置必须为对象');
  const v = value as Record<string, unknown>;
  if (typeof v.bocUrl !== 'string' || !isBocUrl(v.bocUrl))
    throw new Error('牌价地址必须为 HTTPS 中行域名（boc.cn / bankofchina.com）');
  if (!v.rules || typeof v.rules !== 'object' || Array.isArray(v.rules))
    throw new Error('规则配置必须为对象');
  return { bocUrl: v.bocUrl, rules: loadConfig(v.rules as DeepPartial<RuleConfig>) };
}

export class DesktopStore {
  private queue = new SerialQueue();
  constructor(readonly dir: string) {}
  async session(): Promise<WorkspaceSession> {
    const raw = await readJson(join(this.dir, 'workspace.json'), {
      openedDir: null,
      selectedBatchDir: null,
      sidebarWidth: SIDEBAR_DEFAULT,
      sidebarCollapsed: false,
    });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('工作区记录格式错误');
    const v = raw as WorkspaceSession;
    if (
      (v.openedDir !== null && typeof v.openedDir !== 'string') ||
      (v.selectedBatchDir !== null && typeof v.selectedBatchDir !== 'string') ||
      typeof v.sidebarWidth !== 'number' ||
      !Number.isFinite(v.sidebarWidth) ||
      typeof v.sidebarCollapsed !== 'boolean'
    )
      throw new Error('工作区记录格式错误');
    return { ...v, sidebarWidth: clampSidebarWidth(v.sidebarWidth) };
  }
  rememberWorkspace(openedDir: string, selectedBatchDir: string | null) {
    return this.queue.run(async () => {
      await writeJson(join(this.dir, 'workspace.json'), {
        ...(await this.session()),
        openedDir,
        selectedBatchDir,
      });
    });
  }
  saveLayout(layout: Partial<SidebarLayout>): Promise<SidebarLayout> {
    return this.queue.run(async () => {
      if (
        !layout ||
        typeof layout !== 'object' ||
        Array.isArray(layout) ||
        Object.keys(layout).some((k) => !['sidebarWidth', 'sidebarCollapsed'].includes(k)) ||
        (layout.sidebarWidth !== undefined &&
          (typeof layout.sidebarWidth !== 'number' || !Number.isFinite(layout.sidebarWidth))) ||
        (layout.sidebarCollapsed !== undefined && typeof layout.sidebarCollapsed !== 'boolean')
      )
        throw new Error('侧栏设置格式错误');
      const session = { ...(await this.session()), ...layout };
      session.sidebarWidth = clampSidebarWidth(session.sidebarWidth);
      await writeJson(join(this.dir, 'workspace.json'), session);
      return { sidebarWidth: session.sidebarWidth, sidebarCollapsed: session.sidebarCollapsed };
    });
  }
  async settings(): Promise<AppSettings> {
    return validateSettings(
      await readJson(join(this.dir, 'settings.json'), {
        bocUrl: DEFAULT_BOC_URL,
        rules: loadConfig(),
      }),
    );
  }
  saveSettings(value: unknown) {
    return this.queue.run(async () => {
      const settings = validateSettings(value);
      await writeJson(join(this.dir, 'settings.json'), settings);
      return settings;
    });
  }
  async hasSession(): Promise<boolean> {
    return access(join(this.dir, 'workspace.json')).then(
      () => true,
      () => false,
    );
  }
  async recent(): Promise<string[]> {
    const raw = await readJson(join(this.dir, 'recent.json'), []);
    if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string'))
      throw new Error('最近目录文件格式错误');
    return raw as string[];
  }
  addRecent(dir: string) {
    return this.queue.run(async () => {
      await writeJson(
        join(this.dir, 'recent.json'),
        [canonicalPath(dir), ...(await this.recent()).filter((v) => !samePath(v, dir))].slice(
          0,
          10,
        ),
      );
    });
  }
  async history(): Promise<Submission[]> {
    const raw = await readJson(join(this.dir, 'history.json'), []);
    if (
      !Array.isArray(raw) ||
      raw.some(
        (v: Submission) =>
          !v ||
          typeof v.batchDir !== 'string' ||
          typeof v.batchId !== 'string' ||
          typeof v.markedAt !== 'string' ||
          (v.claimId !== undefined && typeof v.claimId !== 'string') ||
          !Array.isArray(v.numbers) ||
          v.numbers.some((n) => typeof n !== 'string'),
      )
    )
      throw new Error('提交历史文件格式错误');
    return raw as Submission[];
  }
  mark(dir: string, numbers: string[], claimId?: string, markedAt = new Date().toISOString()) {
    return this.queue.run(async () => {
      const history = (await this.history()).filter(
        (v) => !samePath(v.batchDir, dir) && (!claimId || v.claimId !== claimId),
      );
      history.push({
        batchDir: canonicalPath(dir),
        batchId: basename(dir),
        markedAt,
        ...(claimId ? { claimId } : {}),
        numbers: [...new Set(numbers)],
      });
      await writeJson(join(this.dir, 'history.json'), history);
    });
  }
  unmark(dir: string, claimId?: string) {
    return this.queue.run(async () =>
      writeJson(
        join(this.dir, 'history.json'),
        (await this.history()).filter(
          (v) => !samePath(v.batchDir, dir) && (!claimId || v.claimId !== claimId),
        ),
      ),
    );
  }
  bindHistoryClaim(dir: string, claimId: string) {
    return this.queue.run(async () =>
      writeJson(
        join(this.dir, 'history.json'),
        (await this.history()).map((entry) =>
          samePath(entry.batchDir, dir) ? { ...entry, claimId } : entry,
        ),
      ),
    );
  }
  async submitted(excludeDir: string): Promise<Set<string>> {
    return new Set(
      (await this.history())
        .filter((v) => !samePath(v.batchDir, excludeDir))
        .flatMap((v) => v.numbers),
    );
  }
}
