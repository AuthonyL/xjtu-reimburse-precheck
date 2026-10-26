// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { App } from '../src/renderer/src/App.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';

it('启动恢复树与批次；分组定位高亮、键盘折叠、侧栏快捷键和右侧设置可用', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-layout-')));
  try {
    const root = join(temp, 'synthetic-root');
    for (const date of ['20260102', '20260103']) {
      await mkdir(join(root, date, 'AI'), { recursive: true });
      await writeFile(join(root, date, 'AI/abcdef.jpg'), 'synthetic');
    }
    const store = new DesktopStore(join(temp, 'user-data'));
    const service = new WorkspaceService(store);
    await service.open(root);
    await service.select(
      service.batch((await service.restore()).workspace!.batches[1]!.batch.dir).batch.dir,
    );
    Object.assign(window, {
      precheck: {
        bootstrap: async () => ({
          settings: await store.settings(),
          recent: [],
          userData: store.dir,
          restored: await service.restore(),
          session: await store.session(),
        }),
        onEvent: () => () => {},
        selectBatch: service.select.bind(service),
        saveLayout: store.saveLayout.bind(store),
      },
    });
    const user = userEvent.setup();
    render(<App />);
    const tree = await screen.findByRole('tree', { name: '工作区文件夹' });
    const dates = within(tree)
      .getAllByRole('treeitem')
      .filter((n) => n.getAttribute('aria-level') === '1');
    expect(dates.map((n) => n.getAttribute('data-batch-id'))).toEqual(['20260103', '20260102']);
    expect(dates[1]!.getAttribute('aria-selected')).toBe('true');
    dates[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(dates[1]);
    await user.click(screen.getByRole('button', { name: /^分组与材料/ }));
    expect(screen.getByRole('button', { name: /^分组与材料/ }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    await user.click(within(tree).getByRole('treeitem', { name: /AI/ }));
    expect(screen.getByTestId('group-AI').classList.contains('group-highlight')).toBe(true);
    const card = screen.getByTestId('group-AI');
    await user.click(within(card).getByRole('button', { name: /AI/ }));
    expect(within(card).queryByTestId('requirement-payment')).toBeNull();
    await user.click(dates[0]!);
    expect(within(screen.getByTestId('group-AI')).queryByTestId('requirement-payment')).toBeNull();
    await user.click(dates[1]!);
    expect(within(screen.getByTestId('group-AI')).queryByTestId('requirement-payment')).toBeNull();
    await user.click(within(tree).getByRole('treeitem', { name: /AI/ }));
    expect(within(screen.getByTestId('group-AI')).getByTestId('requirement-payment')).toBeTruthy();
    dates[1]!.focus();
    await user.keyboard('{ArrowLeft}');
    expect(dates[1]!.getAttribute('aria-expanded')).toBe('false');
    await user.keyboard('{ArrowRight}');
    expect(dates[1]!.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');
    expect(document.activeElement?.textContent).toContain('AI');
    expect(screen.getByTestId('group-AI').classList.contains('group-highlight')).toBe(true);
    const separator = screen.getByRole('separator', { name: '调整侧栏宽度' });
    separator.focus();
    await user.keyboard('{End}');
    await waitFor(async () => expect((await store.session()).sidebarWidth).toBe(480));
    await user.keyboard('{Home}');
    await waitFor(async () => expect((await store.session()).sidebarWidth).toBe(220));
    await user.keyboard('{Control>}b{/Control}');
    expect(screen.queryByRole('tree')).toBeNull();
    await user.click(screen.getByRole('button', { name: /展开侧栏/ }));
    await user.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getByRole('heading', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('tree')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: '分组' }));
    expect(screen.queryByRole('button', { name: '规则' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: '规则' }));
    expect(screen.getByRole('tab', { name: '规则' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(async () => expect((await store.session()).sidebarCollapsed).toBe(false));
  } finally {
    cleanup();
    await rm(temp, { recursive: true, force: true });
  }
});
