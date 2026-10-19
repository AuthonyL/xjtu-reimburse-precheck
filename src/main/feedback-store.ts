import { randomUUID } from 'node:crypto';
import { basename, join, posix, win32 } from 'node:path';
import { readJson, writeJson, SerialQueue } from './json-store.js';
import { loadConfig, type RuleConfig } from '../core/rules/config.js';
import {
  DEFAULTS_HASH,
  hashConfig,
  configDifferences,
  upgradeItems,
  applyUpgradeChoices,
} from '../core/feedback/version.js';
import {
  FEEDBACK_TYPES,
  type FeedbackRecord,
  type RuleVersionInfo,
  type RuleUpgradeResult,
  type UpgradeChoices,
} from '../shared/feedback.js';
const safeRelative = (s: string) =>
  typeof s === 'string' &&
  !posix.isAbsolute(s) &&
  !win32.isAbsolute(s) &&
  !s.split(/[\\/]/).includes('..');
export class FeedbackStore {
  private queue = new SerialQueue();
  constructor(readonly dir: string) {}
  async list(): Promise<FeedbackRecord[]> {
    const rows = await readJson(join(this.dir, 'feedback.json'), []);
    if (
      !Array.isArray(rows) ||
      rows.some(
        (r) =>
          !r ||
          typeof r.id !== 'string' ||
          typeof r.note !== 'string' ||
          typeof r.workspaceKey !== 'string' ||
          !safeRelative(r.directory) ||
          !Array.isArray(r.files) ||
          r.files.some((p: unknown) => typeof p !== 'string' || !safeRelative(p)),
      )
    )
      throw new Error('反馈文件格式错误');
    return rows as FeedbackRecord[];
  }
  put(input: Omit<FeedbackRecord, 'id' | 'recordedAt'>): Promise<FeedbackRecord> {
    return this.queue.run(async () => {
      if (
        !input ||
        !Object.hasOwn(FEEDBACK_TYPES, input.type) ||
        !input.note.trim() ||
        input.note.length > 4000
      )
        throw new Error('请选择反馈类型并填写备注（最多 4000 字）');
      if (!safeRelative(input.directory) || input.files.some((p) => !safeRelative(p)))
        throw new Error('反馈只能记录相对工作区的路径');
      const rows = await this.list();
      const index = rows.findIndex(
        (r) =>
          r.workspaceKey === input.workspaceKey &&
          r.directory === input.directory &&
          r.problemKey === input.problemKey,
      );
      const record = {
        ...input,
        note: input.note.trim(),
        id: index >= 0 ? rows[index]!.id : randomUUID(),
        recordedAt: new Date().toISOString(),
      };
      if (index >= 0) rows[index] = record;
      else rows.push(record);
      await writeJson(join(this.dir, 'feedback.json'), rows);
      return record;
    });
  }
  remove(id: string) {
    return this.queue.run(async () =>
      writeJson(
        join(this.dir, 'feedback.json'),
        (await this.list()).filter((r) => r.id !== id),
      ),
    );
  }
}
interface VersionState {
  hash: string;
  defaults: RuleConfig;
  lastRunHash: string;
  imported?: { file: string; importedAt: string };
}
export class RuleVersionStore {
  private queue = new SerialQueue();
  constructor(
    readonly dir: string,
    readonly defaults = loadConfig(),
    readonly hash = DEFAULTS_HASH,
  ) {}
  private async state(): Promise<VersionState> {
    const value = await readJson(join(this.dir, 'rules-state.json'), {
      hash: this.hash,
      defaults: this.defaults,
      lastRunHash: this.hash,
    });
    if (!value || typeof value !== 'object' || typeof (value as VersionState).hash !== 'string')
      throw new Error('规则版本记录格式错误');
    const v = value as VersionState;
    if (!v.defaults || typeof v.defaults !== 'object' || Array.isArray(v.defaults))
      throw new Error('默认规则快照格式错误');
    return structuredClone(v);
  }
  async info(rules: RuleConfig): Promise<RuleVersionInfo> {
    const state = await this.state();
    return {
      defaultsHash: this.hash,
      configHash: hashConfig(rules),
      customized: configDifferences(this.defaults, rules).length,
      ...(state.imported ? { imported: state.imported } : {}),
      ...(state.hash !== this.hash
        ? {
            upgrade: {
              fromHash: state.hash,
              toHash: this.hash,
              items: upgradeItems(state.defaults, this.defaults, rules),
            },
          }
        : {}),
    };
  }
  initialize(rules: RuleConfig): Promise<RuleUpgradeResult> {
    return this.queue.run(async () => {
      const state = await this.state();
      let result = rules;
      if (
        state.hash !== this.hash &&
        configDifferences(state.defaults, rules).filter(
          (d) => JSON.stringify(d.currentValue) !== JSON.stringify(this.defaultsAt(d.path)),
        ).length === 0
      ) {
        result = structuredClone(this.defaults);
        state.hash = this.hash;
        state.defaults = this.defaults;
      }
      state.lastRunHash = this.hash;
      await writeJson(join(this.dir, 'rules-state.json'), state);
      return { rules: result, version: await this.info(result) };
    });
  }
  private defaultsAt(path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>(
        (v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
        this.defaults,
      );
  }
  resolve(
    rules: RuleConfig,
    choices: UpgradeChoices,
    persist?: (rules: RuleConfig) => Promise<unknown>,
  ): Promise<RuleUpgradeResult> {
    return this.queue.run(async () => {
      const state = await this.state();
      const next = loadConfig(applyUpgradeChoices(state.defaults, this.defaults, rules, choices));
      if (persist) await persist(next);
      await writeJson(join(this.dir, 'rules-state.json'), {
        ...state,
        hash: this.hash,
        defaults: this.defaults,
        lastRunHash: this.hash,
      });
      return { rules: next, version: await this.info(next) };
    });
  }
  acknowledge() {
    return this.queue.run(async () => {
      const state = await this.state();
      delete state.imported;
      await writeJson(join(this.dir, 'rules-state.json'), {
        ...state,
        hash: this.hash,
        defaults: this.defaults,
        lastRunHash: this.hash,
      });
    });
  }
  imported(file: string | null) {
    return this.queue.run(async () => {
      const state = await this.state();
      if (file) state.imported = { file: basename(file), importedAt: new Date().toISOString() };
      else delete state.imported;
      await writeJson(join(this.dir, 'rules-state.json'), state);
    });
  }
}
