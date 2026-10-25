// @vitest-environment jsdom
import { afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { App } from '../src/renderer/src/App.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import { defaultClaim } from '../src/core/domain/claim.js';
import { groupAnchor } from '../src/shared/navigation.js';
import { batch, config } from './helpers.js';
import { resetStores, seedBatch, seedSettings } from './store-helpers.js';

afterEach(cleanup);
it('重复分组定位都在展开后的 DOM 提交后滚动，手动展开不会再次定位', async () => {
  const current = batch();
  seedBatch({
    batch: current,
    report: buildReport(checkBatch(current, config())),
    claim: defaultClaim(current.id, '2026-01-01'),
    waived: 0,
    markedAt: null,
    manualTasks: [],
    outputs: [],
  });
  seedSettings({ rules: config(), bocUrl: 'synthetic' });
  const bootstrap = {
    ...useWorkspaceStore.getState().boot!,
    restored: { workspace: useWorkspaceStore.getState().view, message: null },
  };
  resetStores();
  Object.assign(window, {
    precheck: {
      bootstrap: async () => bootstrap,
      onEvent: () => () => {},
      selectBatch: async () => {},
    },
  });
  const original = HTMLElement.prototype.scrollIntoView;
  const expandedWhenScrolled: boolean[] = [];
  HTMLElement.prototype.scrollIntoView = vi.fn(function (this: HTMLElement) {
    if (this.id === groupAnchor('根目录'))
      expandedWhenScrolled.push(
        this.querySelector('[class*="_groupSummary_"]')?.getAttribute('aria-expanded') === 'true',
      );
  });
  onTestFinished(() => {
    HTMLElement.prototype.scrollIntoView = original;
  });
  render(<App />);
  await screen.findByTestId('batch-summary');
  const user = userEvent.setup();
  const target = () => within(screen.getByRole('tree')).getByRole('treeitem', { name: /根目录/ });
  const summary = () =>
    within(screen.getByTestId('group-根目录')).getByRole('button', { name: /根目录/ });
  await user.click(target());
  expect(expandedWhenScrolled).toEqual([true]);
  await user.click(summary());
  await user.click(summary());
  expect(expandedWhenScrolled).toEqual([true]);
  await user.click(summary());
  await user.click(target());
  expect(expandedWhenScrolled).toEqual([true, true]);
});
