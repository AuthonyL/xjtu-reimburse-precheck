import { expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { saveManualEntry } from '../src/main/manual-store.js';
import { readManual } from '../src/core/manual.js';
import { writeJson } from '../src/main/json-store.js';
import { ensureClaim } from '../src/main/claim-store.js';
import { transitionClaim } from '../src/main/claim-store.js';

it('旧提交历史迁移到 Claim，补 claimId，保留 markedAt，退回草稿不再迁移', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-migrate-')));
  try {
    const dir = join(temp, '20260102');
    await mkdir(dir);
    await writeFile(join(dir, '说明.jpg'), 'synthetic');
    const store = new DesktopStore(join(temp, '.user-data'));
    const at = '2026-01-03T00:00:00.000Z';
    await writeJson(join(store.dir, 'history.json'), [
      { batchDir: dir, batchId: '20260102', markedAt: at, numbers: ['SYNTH-HISTORY'] },
    ]);
    const service = new WorkspaceService(store);
    const view = (await service.open(dir)).batches[0]!;
    expect(view.claim.state).toBe('submitted');
    expect(view.claim.transitions).toEqual([{ from: 'draft', to: 'submitted', at }]);
    expect(view.markedAt).toBe(at);
    expect((await store.history())[0]?.claimId).toBe(view.claim.id);
    const settingsBefore = await store.settings();
    const draft = (await service.transitionClaim(dir, 'draft')).batches[0]!;
    expect(draft.claim.state).toBe('draft');
    expect(draft.markedAt).toBe(at);
    expect((await service.refresh()).batches[0]!.claim.state).toBe('draft');
    expect(await store.history()).toEqual([]);
    expect(await store.settings()).toEqual(settingsBefore);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('历史不会覆盖已进入待提交的 Claim，旧路径补 claimId 后改名仍命中登记簿', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-rename-registry-')));
  try {
    const root = join(temp, 'root');
    const dir = join(root, '20260102');
    await mkdir(dir, { recursive: true });
    await saveManualEntry(dir, {
      group: '根目录',
      number: 'SYNTH-RENAMED',
      currency: 'CNY',
      amount: 50,
      paymentDate: '2026-01-02',
    });
    const store = new DesktopStore(join(temp, '.user-data'));
    const service = new WorkspaceService(store);
    await service.open(root);
    await service.transitionClaim(dir, 'ready');
    await service.transitionClaim(dir, 'submitted');
    const id = (await ensureClaim(dir)).id;
    const renamed = join(root, '20260103');
    await rename(dir, renamed);
    await service.refresh();
    expect((await service.registry()).entries.filter((e) => e.claimId === id)).toMatchObject([
      { batchDir: renamed },
    ]);
    expect(service.batch(renamed).report.findings.some((f) => f.ruleId === 'dup')).toBe(false);
    const other = join(temp, 'other', '20260104');
    await mkdir(other, { recursive: true });
    await saveManualEntry(other, {
      group: '根目录',
      number: 'SYNTH-RENAMED',
      currency: 'CNY',
      amount: 50,
      paymentDate: '2026-01-02',
    });
    await service.open(other);
    expect(
      service
        .batch(other)
        .report.findings.some((f) => f.ruleId === 'dup' && f.message.includes('已提交历史')),
    ).toBe(true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('首次迁移不覆盖非草稿 Claim，仍兼容其他目录的旧历史号码', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-migrate-ready-')));
  try {
    const dir = join(temp, '20260102');
    await mkdir(dir);
    await saveManualEntry(dir, {
      group: '根目录',
      number: 'SYNTH-LEGACY',
      currency: 'CNY',
      amount: 10,
      paymentDate: '2026-01-02',
    });
    const ready = await transitionClaim(dir, 'ready');
    const store = new DesktopStore(join(temp, '.user-data'));
    await writeJson(join(store.dir, 'history.json'), [
      { batchDir: dir, batchId: '20260102', markedAt: '2026-01-03', numbers: ['SYNTH-SELF'] },
      {
        batchDir: join(temp, 'unopened'),
        batchId: 'unopened',
        markedAt: '2026-01-03',
        numbers: ['SYNTH-LEGACY'],
      },
    ]);
    const service = new WorkspaceService(store);
    const view = (await service.open(dir)).batches[0]!;
    expect(view.claim).toEqual(ready);
    expect(view.markedAt).toBeNull();
    expect((await store.history())[0]?.claimId).toBe(ready.id);
    expect(
      view.report.findings.some((f) => f.ruleId === 'dup' && f.message.includes('已提交历史')),
    ).toBe(true);
    const updated = (
      await service.updateClaim(dir, { project: '合成项目', claimant: '合成申请人', fund: 'other' })
    ).batches[0]!;
    expect(updated.claim).toMatchObject({
      id: ready.id,
      state: 'ready',
      project: '合成项目',
      claimant: '合成申请人',
      fund: 'other',
    });
    expect(updated.claim.transitions).toEqual(ready.transitions);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('兼容仅 group 的既有手填记录，界面编辑更新原条目而不新增', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-group-entry-')));
  try {
    const dir = join(temp, '20260102');
    await mkdir(join(dir, 'AI'), { recursive: true });
    await writeFile(join(dir, 'AI/订阅说明.jpg'), 'synthetic');
    const initial = {
      group: 'AI',
      currency: 'USD',
      amount: 20,
      exchangeRate: 7,
      paymentDate: '2026-01-02',
    };
    await saveManualEntry(dir, initial);
    const service = new WorkspaceService(new DesktopStore(join(temp, 'user-data')));
    const view = await service.open(dir);
    const task = view.batches[0]!.manualTasks[0]!;
    expect(task.pending).toBe(false);
    expect(task.entry.exchangeRate).toBe(7);
    expect(task.entry.number).toBeUndefined();
    const updated = await service.manual(dir, {
      ...initial,
      ...task.entry,
      amount: 30,
      exchangeRate: 8,
    });
    expect((await readManual(dir)).entries).toHaveLength(1);
    expect(updated.batches[0]!.report.totalCny).toBe(240);
    expect(updated.batches[0]!.report.findings.some((f) => f.ruleId === 'dup')).toBe(false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('打开后被替换为符号链接的批次不能写入外部目录', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-replaced-batch-')));
  try {
    const dir = join(temp, '20260102');
    const outside = join(temp, 'outside');
    await mkdir(join(dir, 'AI'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(dir, 'AI/订阅说明.jpg'), 'synthetic');
    const service = new WorkspaceService(new DesktopStore(join(temp, 'user-data')));
    await service.open(dir);
    await rename(dir, join(temp, 'old-batch'));
    await symlink(outside, dir, 'junction');
    await expect(
      service.manual(dir, { group: 'AI', currency: 'USD', amount: 20, paymentDate: '2026-01-02' }),
    ).rejects.toThrow('符号链接');
    await expect(stat(join(outside, '_预检'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(service.refresh()).rejects.toThrow('符号链接');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('工作区确认附件、手填、导出、历史和上下文串联，仅允许当前批次', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-desktop-service-'));
  try {
    const batch = join(dir, '20260101');
    await mkdir(join(batch, 'AI'), { recursive: true });
    await writeFile(join(batch, 'AI/abcdef.jpg'), 'synthetic-image');
    const service = new WorkspaceService(new DesktopStore(join(dir, 'user-data')));
    let view = await service.open(batch);
    const actualDir = view.batches[0]!.batch.dir;
    const group = view.batches[0]!.report.groups.find((g) => g.group.name === 'AI')!;
    expect(group.requirements.find((r) => r.type === 'payment')!.status).toBe('unconfirmed');
    expect(view.batches[0]!.manualTasks).toHaveLength(1);
    await expect(service.confirm(join(dir, 'elsewhere'), 'a.jpg', 'payment')).rejects.toThrow();
    view = await service.confirm(actualDir, 'AI/abcdef.jpg', 'payment');
    expect(
      view.batches[0]!.report.groups[0]!.requirements.find((r) => r.type === 'payment')!.status,
    ).toBe('found');
    view = await service.manual(actualDir, {
      group: 'AI',
      number: 'SYNTH-USD',
      currency: 'USD',
      amount: 20,
      paymentDate: '2026-01-02',
      exchangeRate: 7,
      rateBase: 1,
      exchangeRateType: '现汇买入价',
    });
    expect(view.batches[0]!.report.totalCny).toBe(140);
    expect(view.batches[0]!.manualTasks.filter((t) => t.pending)).toHaveLength(0);
    const settings = await service.store.settings();
    settings.rules.exchangeRateType = '现汇卖出价';
    await service.store.saveSettings(settings);
    view = await service.refresh();
    expect(view.batches[0]!.manualTasks.filter((t) => t.pending)).toHaveLength(1);
    settings.rules.exchangeRateType = '现汇买入价';
    await service.store.saveSettings(settings);
    view = await service.refresh();
    view = await service.export(actualDir);
    expect(view.batches[0]!.outputs).toHaveLength(3);
    expect(await readFile(join(actualDir, '_预检/汇总.md'), 'utf8')).toContain('140.00');
    await service.transitionClaim(actualDir, 'ready');
    view = await service.mark(actualDir, true);
    expect(view.batches[0]!.markedAt).not.toBeNull();
    expect(view.batches[0]!.report.findings.some((f) => f.ruleId === 'dup')).toBe(false);
    view = await service.mark(actualDir, false);
    expect(view.batches[0]!.claim.state).toBe('draft');
    expect(view.batches[0]!.markedAt).not.toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
