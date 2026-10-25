import { beforeEach, expect, it, vi } from 'vitest';
import type { DesktopApi, WorkspaceView } from '../src/shared/api.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { routeForDir, useRouteStore } from '../src/renderer/src/store/route.js';
import { useStatusStore } from '../src/renderer/src/store/status.js';
import { useLayoutStore } from '../src/renderer/src/store/layout.js';
import { resetStores, seedWorkspace } from './store-helpers.js';

const view: WorkspaceView = {
  kind: 'root',
  dir: 'synthetic',
  openedDir: 'synthetic',
  selectedBatchDir: null,
  batches: [],
  rejected: null,
};
beforeEach(() => {
  resetStores();
  vi.stubGlobal('window', {
    precheck: {
      selectBatch: vi.fn().mockResolvedValue(undefined),
      saveLayout: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopApi,
  });
});
it('run/apply 在等待期间清空消息，成功替换视图并写入通知', async () => {
  seedWorkspace(view);
  useStatusStore.setState({ error: '旧错误', notice: '旧通知' });
  let finish!: (value: WorkspaceView) => void;
  const next = { ...view, dir: 'next' };
  const pending = useStatusStore.getState().run(
    () =>
      useWorkspaceStore.getState().apply(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    '保存完成',
  );
  expect(useStatusStore.getState()).toMatchObject({ busy: true, error: '', notice: '' });
  expect(useWorkspaceStore.getState().view).toBe(view);
  finish(next);
  await pending;
  expect(useWorkspaceStore.getState().view).toBe(next);
  expect(useStatusStore.getState()).toMatchObject({ busy: false, error: '', notice: '保存完成' });
});
it.each([new Error('合成失败'), '合成失败'])('run/apply 失败保留视图并报告错误', async (error) => {
  seedWorkspace(view);
  await useStatusStore.getState().run(
    () =>
      useWorkspaceStore.getState().apply(async () => {
        throw error;
      }),
    '不会显示',
  );
  expect(useWorkspaceStore.getState().view).toBe(view);
  expect(useStatusStore.getState()).toMatchObject({ busy: false, error: '合成失败', notice: '' });
});
it('apply 无返回视图时保留原视图，直接调用时向上传播失败', async () => {
  seedWorkspace(view);
  await useWorkspaceStore.getState().apply(async () => {});
  expect(useWorkspaceStore.getState().view).toBe(view);
  await expect(
    useWorkspaceStore.getState().apply(async () => {
      throw new Error('失败');
    }),
  ).rejects.toThrow('失败');
});
it('navigate 同步当前目录、分组及持久化选择，规则页保留选择', () => {
  seedWorkspace(view);
  const navigate = useRouteStore.getState().navigate;
  navigate({ page: 'claim', dir: 'batch', group: '材料' });
  expect(useRouteStore.getState().route).toEqual({ page: 'claim', dir: 'batch', group: '材料' });
  expect(useWorkspaceStore.getState().view?.selectedBatchDir).toBe('batch');
  expect(window.precheck.selectBatch).toHaveBeenCalledWith('batch');
  const revision = useRouteStore.getState().revision;
  navigate({ page: 'claim', dir: 'batch', group: '材料' });
  expect(useRouteStore.getState().revision).toBeGreaterThan(revision);
  vi.mocked(window.precheck.selectBatch).mockClear();
  navigate({ page: 'rules', ruleId: 'F2' });
  expect(useRouteStore.getState().route).toEqual({
    page: 'rules',
    dir: 'batch',
    group: '材料',
    ruleId: 'F2',
  });
  expect(useWorkspaceStore.getState().view?.selectedBatchDir).toBe('batch');
  expect(window.precheck.selectBatch).not.toHaveBeenCalled();
  navigate({ page: 'overview' });
  expect(useWorkspaceStore.getState().view?.selectedBatchDir).toBeNull();
  expect(window.precheck.selectBatch).toHaveBeenCalledWith(null);
});
it('目录路由区分劳务、只读参考与总览', () => {
  const workspace = {
    ...view,
    labor: [{ report: { dir: 'labor' } }],
    rejected: { batch: { dir: 'rejected' } },
  } as WorkspaceView;
  expect(routeForDir(workspace, 'labor')).toEqual({ page: 'labor', dir: 'labor' });
  expect(routeForDir(workspace, 'rejected')).toEqual({ page: 'rejected', dir: 'rejected' });
  expect(routeForDir(workspace, null)).toEqual({ page: 'overview' });
  expect(routeForDir(null, null)).toEqual({ page: 'home' });
});
it('布局立即更新并保存，持久化失败保留布局并报告错误', async () => {
  await useLayoutStore.getState().saveLayout({ sidebarCollapsed: true });
  expect(useLayoutStore.getState().sidebarCollapsed).toBe(true);
  expect(window.precheck.saveLayout).toHaveBeenCalledWith({ sidebarCollapsed: true });
  vi.mocked(window.precheck.saveLayout).mockRejectedValue(new Error('保存失败'));
  await useLayoutStore.getState().saveLayout({ sidebarWidth: 300 });
  expect(useLayoutStore.getState().sidebarWidth).toBe(300);
  expect(useStatusStore.getState().error).toBe('Error: 保存失败');
});
it('没有工作区时设置返回首页不写入批次选择', () => {
  const navigate = useRouteStore.getState().navigate;
  navigate({ page: 'rules' });
  navigate({ page: 'home' });
  expect(useRouteStore.getState().route).toEqual({ page: 'home' });
  expect(window.precheck.selectBatch).not.toHaveBeenCalled();
});
it('设置和规则定位不触发侧栏重新展开，批次定位才更新选择版本', () => {
  seedWorkspace(view);
  const navigate = useRouteStore.getState().navigate;
  const revision = useRouteStore.getState().selectionRevision;
  navigate({ page: 'rules', ruleId: 'F2' });
  expect(useRouteStore.getState().selectionRevision).toBe(revision);
  navigate({ page: 'claim', dir: 'batch' });
  expect(useRouteStore.getState().selectionRevision).toBeGreaterThan(revision);
});
