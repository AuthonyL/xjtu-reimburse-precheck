import { expect, it } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesktopStore } from '../src/main/store.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { buildWorkspaceTree, clampSidebarWidth } from '../src/shared/navigation.js';
import { saveManualEntry } from '../src/main/manual-store.js';

async function fixture() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-navigation-')));
  const root = join(temp, 'synthetic-root');
  for (const dir of ['20260102/PCB', '20260103/AI', '无法报销费用/参考']) {
    await mkdir(join(root, dir), { recursive: true });
    await writeFile(join(root, dir, 'abcdef.jpg'), 'synthetic');
  }
  return { temp, root, store: new DesktopStore(join(temp, 'user-data')) };
}

it('工作区和批次选择落盘，重启恢复；路径失效回到首页并说明路径', async () => {
  const { temp, root, store } = await fixture();
  try {
    const service = new WorkspaceService(store);
    await service.open(root);
    await service.select(join(root, '20260102'));
    await store.saveLayout({ sidebarWidth: 345, sidebarCollapsed: true });
    const restarted = new WorkspaceService(new DesktopStore(store.dir));
    const restored = await restarted.restore();
    expect(restored.workspace?.dir).toBe(root);
    expect(restored.workspace?.selectedBatchDir).toBe(join(root, '20260102'));
    expect(await store.session()).toMatchObject({
      openedDir: root,
      selectedBatchDir: join(root, '20260102'),
      sidebarWidth: 345,
      sidebarCollapsed: true,
    });
    await rm(root, { recursive: true });
    expect(await new WorkspaceService(store).restore()).toEqual({
      workspace: null,
      message: `上次的文件夹已不存在：${root}`,
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('没有工作区记录时按最近目录恢复；已有记录且未打开目录时停在首页', async () => {
  const { temp, root, store } = await fixture();
  try {
    await store.addRecent(root);
    expect((await new WorkspaceService(store).restore()).workspace?.dir).toBe(root);
    const laidOut = new DesktopStore(join(temp, 'user-data-layout'));
    await laidOut.addRecent(root);
    await laidOut.saveLayout({ sidebarWidth: 300 });
    expect(await new WorkspaceService(laidOut).restore()).toEqual({
      workspace: null,
      message: null,
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('单批次显示父根目录，树日期倒序、拒票置底，分组反映最差材料状态', async () => {
  const { temp, root, store } = await fixture();
  try {
    const view = await new WorkspaceService(store).open(join(root, '20260102'));
    expect(view.dir).toBe(root);
    expect(view.selectedBatchDir).toBe(join(root, '20260102'));
    const tree = buildWorkspaceTree(view);
    expect(tree.map((n) => n.label)).toEqual(['20260103', '20260102', '无法报销费用']);
    expect(tree[0]!.children.find((g) => g.label === 'AI')!.status).toBe('unconfirmed');
    const requirements = view.batches[0]!.report.groups[0]!.requirements;
    requirements.forEach((r) => {
      r.status = 'found';
    });
    expect(buildWorkspaceTree(view)[0]!.children.find((g) => g.label === 'AI')!.status).toBe(
      'found',
    );
    requirements[0]!.status = 'missing';
    expect(buildWorkspaceTree(view)[0]!.children.find((g) => g.label === 'AI')!.status).toBe(
      'missing',
    );
    expect(tree[1]!.children.some((g) => g.label === '根目录')).toBe(true);
    expect(tree[2]!.readOnly).toBe(true);
    await expect(
      new WorkspaceService(store).open(join(root, '无法报销费用')),
    ).resolves.toBeTruthy();
    const service = new WorkspaceService(store);
    const reopened = await service.open(root);
    await expect(service.export(reopened.rejected!.batch.dir)).rejects.toThrow('只读');
    const standalone = join(temp, 'standalone');
    await mkdir(standalone);
    const single = await service.open(standalone);
    expect(single.kind).toBe('batch');
    expect(buildWorkspaceTree(single).map((n) => n.label)).toEqual(['standalone']);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('局部刷新重新计算相关批次查重徽标；学校报销单和提交历史同步影响其他批次', async () => {
  const { temp, root, store } = await fixture();
  try {
    const older = join(root, '20260102');
    const newer = join(root, '20260103');
    const entry = {
      group: 'AI',
      number: 'SYNTH-CACHED-DUP',
      currency: 'USD',
      amount: 20,
      paymentDate: '2026-01-02',
      exchangeRate: 7,
    };
    await mkdir(join(older, 'AI'));
    await writeFile(join(older, 'AI/订阅说明.jpg'), 'synthetic');
    await saveManualEntry(older, entry);
    const service = new WorkspaceService(store);
    const initial = await service.open(root);
    const before = buildWorkspaceTree(initial).find((b) => b.label === '20260102')!.errors;
    let updated = await service.manual(newer, entry);
    expect(buildWorkspaceTree(updated).find((b) => b.label === '20260102')!.errors).toBe(
      before + 1,
    );
    await writeFile(join(newer, '学校报销单.pdf'), 'synthetic school form');
    updated = await service.refresh(newer);
    expect(
      updated.batches
        .find((b) => b.batch.dir === older)!
        .report.findings.some(
          (f) => f.ruleId === 'dup' && f.message.includes('已在 20260103 报销'),
        ),
    ).toBe(true);
    await service.transitionClaim(newer, 'ready');
    updated = await service.mark(newer, true);
    expect(
      updated.batches
        .find((b) => b.batch.dir === older)!
        .report.findings.some((f) => f.ruleId === 'dup' && f.message.includes('已提交历史')),
    ).toBe(true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('侧栏宽度限制上下界，非法布局不落盘，宽度修改不覆盖批次选择', async () => {
  const { temp, root, store } = await fixture();
  try {
    expect([120, 340, 900, Number.NaN].map(clampSidebarWidth)).toEqual([220, 340, 480, 280]);
    await new WorkspaceService(store).open(root);
    await store.saveLayout({ sidebarWidth: 10 });
    expect((await store.session()).sidebarWidth).toBe(220);
    await store.saveLayout({ sidebarWidth: 999 });
    expect((await store.session()).sidebarWidth).toBe(480);
    await expect(store.saveLayout({ sidebarWidth: Number.NaN })).rejects.toThrow();
    expect((await store.session()).openedDir).toBe(root);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('恢复遇到损坏的工作区文件时回到首页，保留布局并能打开其他目录', async () => {
  const { temp, root, store } = await fixture();
  try {
    await new WorkspaceService(store).open(root);
    await store.saveLayout({ sidebarWidth: 360 });
    await mkdir(join(root, '20260103/_预检'), { recursive: true });
    await writeFile(join(root, '20260103/_预检/rates.json'), 'invalid synthetic JSON');
    const service = new WorkspaceService(store);
    const result = await service.restore();
    expect(result.workspace).toBeNull();
    expect(result.message).toContain('无法恢复上次的工作区：' + root);
    expect((await store.session()).sidebarWidth).toBe(360);
    const other = join(temp, 'other');
    await mkdir(other);
    expect((await service.open(other)).dir).toBe(other);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('直接打开含日期子目录的拒票目录或其后代仍然只读', async () => {
  const { temp, root, store } = await fixture();
  try {
    const reference = join(root, '无法报销费用');
    const nested = join(reference, '20260101/AI');
    const repeated = join(reference, '归档/无法报销费用');
    await mkdir(nested, { recursive: true });
    await mkdir(repeated, { recursive: true });
    await mkdir(join(reference, '归档/20250101'));
    await writeFile(join(nested, 'abcdef.jpg'), 'synthetic');
    for (const input of [reference, nested, repeated]) {
      const service = new WorkspaceService(store);
      const view = await service.open(input);
      expect(view.batches.map((b) => b.batch.id)).toEqual(['20260103', '20260102']);
      expect(view.rejected?.readOnly).toBe(true);
      expect(view.selectedBatchDir).toBe(reference);
      await expect(service.export(reference)).rejects.toThrow('只读');
      await expect(service.confirm(reference, '20260101/AI/abcdef.jpg', 'payment')).rejects.toThrow(
        '只读',
      );
      await expect(service.mark(reference, true)).rejects.toThrow('只读');
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('切换批次不扫描，局部重查不重扫其他批次，全量重查才读取其新文件', async () => {
  const { temp, root, store } = await fixture();
  try {
    const service = new WorkspaceService(store);
    await service.open(root);
    await writeFile(join(root, '20260103/AI/支付记录.jpg'), 'synthetic');
    await service.select(join(root, '20260102'));
    let view = await service.refresh(join(root, '20260102'));
    expect(view.batches.find((b) => b.batch.id === '20260103')!.batch.attachments).toHaveLength(1);
    view = await service.refresh();
    expect(view.batches.find((b) => b.batch.id === '20260103')!.batch.attachments).toHaveLength(2);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
