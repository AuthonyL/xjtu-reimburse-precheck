import { expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FeedbackStore, RuleVersionStore } from '../src/main/feedback-store.js';
import { config } from './helpers.js';
import type { FeedbackRecord } from '../src/shared/feedback.js';
const record = {
  workspaceKey: 'opaque',
  workspaceName: '合成根',
  directory: '批次',
  problemKey: 'p',
  type: 'falsePositive',
  note: '合成备注',
  ruleId: 'R1',
  message: '合成问题',
  action: '合成处理',
  files: [],
  invoices: [],
  configHash: 'abc',
} as Omit<FeedbackRecord, 'id' | 'recordedAt'>;
it('反馈新增、同一问题覆盖和删除，文件里不保存绝对目录', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'feedback-store-'));
  const store = new FeedbackStore(dir);
  const first = await store.put(record);
  const next = await store.put({ ...record, note: '更新备注' });
  expect(next.id).toBe(first.id);
  expect(await store.list()).toEqual([next]);
  expect(await readFile(join(dir, 'feedback.json'), 'utf8')).not.toContain(dir);
  await store.remove(next.id);
  expect(await store.list()).toEqual([]);
  await expect(store.put({ ...record, note: ' ' })).rejects.toThrow(/备注/);
});
it('无自定义升级静默采用新默认；有自定义保留升级提示，选择后持久化，记录导入来源', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'version-store-'));
  const old = config();
  const next = structuredClone(old);
  next.thresholds.inventory.value = 700;
  const first = new RuleVersionStore(dir, old, 'a'.repeat(64));
  await first.initialize(old);
  const upgraded = new RuleVersionStore(dir, next, 'b'.repeat(64));
  const plain = await upgraded.initialize(old);
  expect(plain.rules.thresholds.inventory.value).toBe(700);
  expect(plain.version.upgrade).toBeUndefined();
  const dir2 = await mkdtemp(join(tmpdir(), 'version-custom-'));
  await new RuleVersionStore(dir2, old, 'a'.repeat(64)).initialize(old);
  const custom = structuredClone(old);
  custom.thresholds.inventory.value = 900;
  const pending = await new RuleVersionStore(dir2, next, 'b'.repeat(64)).initialize(custom);
  expect(pending.version.upgrade?.items[0]?.currentValue).toBe(900);
  const store = new RuleVersionStore(dir2, next, 'b'.repeat(64));
  expect((await store.initialize(custom)).version.upgrade).toBeDefined();
  const adopted = await store.resolve(custom, { 'thresholds.inventory.value': 'default' });
  expect(adopted.rules.thresholds.inventory.value).toBe(700);
  expect(adopted.version.upgrade).toBeUndefined();
  await store.imported('组内规则.json');
  expect((await store.info(adopted.rules)).imported?.file).toBe('组内规则.json');
});
it('升级保留旧快照中不存在的新增配置项，保存失败不吞掉待处理升级', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'version-addition-'));
  const old = config();
  delete (old as Partial<typeof old>).transportKeywords;
  await new RuleVersionStore(dir, old, 'a'.repeat(64)).initialize(old);
  const current = config();
  current.thresholds.payment.value = 1500;
  const store = new RuleVersionStore(dir, config(), 'b'.repeat(64));
  const pending = await store.initialize(current);
  expect(pending.version.upgrade?.items).toContainEqual(
    expect.objectContaining({ path: 'transportKeywords', oldDefault: undefined }),
  );
  const choices = Object.fromEntries(
    pending.version.upgrade!.items.map((i) => [i.path, 'default' as const]),
  );
  await expect(
    store.resolve(current, choices, async () => {
      throw new Error('合成保存失败');
    }),
  ).rejects.toThrow('合成保存失败');
  expect((await store.info(current)).upgrade).toBeDefined();
  await store.acknowledge();
  expect((await store.info(config())).upgrade).toBeUndefined();
});
it('通用理由模板升级：无自定义静默采用，有自定义可保留或采用新默认', async () => {
  const old = config();
  old.highValueReasons = ['合成旧模板'];
  const defaults = config();
  expect(defaults.highValueReasons[0]).toContain('{材料名称}');
  for (const choice of ['mine', 'default'] as const) {
    const dir = await mkdtemp(join(tmpdir(), 'version-reasons-'));
    await new RuleVersionStore(dir, old, 'c'.repeat(64)).initialize(old);
    const current = structuredClone(old);
    current.highValueReasons = ['合成自定义模板'];
    const store = new RuleVersionStore(dir, defaults, 'd'.repeat(64));
    const pending = await store.initialize(current);
    expect(pending.version.upgrade?.items).toContainEqual(
      expect.objectContaining({ path: 'highValueReasons', currentValue: ['合成自定义模板'] }),
    );
    const result = await store.resolve(current, { highValueReasons: choice });
    expect(result.rules.highValueReasons).toEqual(
      choice === 'mine' ? current.highValueReasons : defaults.highValueReasons,
    );
  }
  const dir = await mkdtemp(join(tmpdir(), 'version-plain-reasons-'));
  await new RuleVersionStore(dir, old, 'c'.repeat(64)).initialize(old);
  const plain = await new RuleVersionStore(dir, defaults, 'd'.repeat(64)).initialize(old);
  expect(plain.rules.highValueReasons).toEqual(defaults.highValueReasons);
  expect(plain.version.upgrade).toBeUndefined();
});
