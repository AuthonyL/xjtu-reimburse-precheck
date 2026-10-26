// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { App } from '../src/renderer/src/App.js';
import { useRouteStore } from '../src/renderer/src/store/route.js';
import { pageWorkspace } from './page-fixtures.js';
import { config } from './helpers.js';
afterEach(cleanup);
it('再次定位已展开的组时先打开材料分节，再对可见目标滚动一次', async () => {
  const view = pageWorkspace();
  const dir = view.batches[0]!.batch.dir;
  view.selectedBatchDir = dir;
  const visible: boolean[] = [];
  const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: function (this: HTMLElement) {
      visible.push(!this.closest('[hidden]'));
    },
  });
  Object.assign(window, {
    precheck: {
      bootstrap: vi.fn(async () => ({
        settings: { rules: config(), bocUrl: '' },
        recent: [],
        userData: '/synthetic-data',
        restored: { workspace: view, message: null },
      })),
      onEvent: () => () => {},
      inbox: vi.fn(async () => []),
      selectBatch: vi.fn(async () => {}),
    },
  });
  try {
    render(<App />);
    await screen.findByTestId('group-PCB');
    act(() => useRouteStore.getState().select(dir, 'PCB'));
    expect(visible).toEqual([true]);
    await userEvent.setup().click(screen.getByRole('button', { name: /^分组与材料/ }));
    visible.length = 0;
    act(() => useRouteStore.getState().select(dir, 'PCB'));
    expect(screen.getByRole('button', { name: /^分组与材料/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(visible).toEqual([true]);
  } finally {
    if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});
