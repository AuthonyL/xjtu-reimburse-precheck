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
    view = await service.mark(actualDir, true);
    expect(view.batches[0]!.markedAt).not.toBeNull();
    expect(view.batches[0]!.report.findings.some((f) => f.ruleId === 'dup')).toBe(false);
    view = await service.mark(actualDir, false);
    expect(view.batches[0]!.markedAt).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
