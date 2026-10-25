import { defaultClaim } from '../src/core/domain/claim.js';
// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Sidebar } from '../src/renderer/src/Sidebar.js';
import { checkBatch } from '../src/core/rules/engine.js';
import { buildReport } from '../src/core/report.js';
import { checkLabor } from '../src/core/labor/engine.js';
import { loadConfig } from '../src/core/rules/config.js';
import type { Batch } from '../src/core/types.js';
import type { WorkspaceView } from '../src/shared/api.js';

afterEach(cleanup);
it.each([
  ['C:\\Users\\runneradmin\\Temp\\合成工作区', '\\'],
  ['/tmp/合成工作区', '/'],
])('原生路径 %s 的劳务节点展开后可按父分支及名称定位', (root, sep) => {
  const dir = root + sep + '20260103';
  const laborDir = dir + sep + '劳务费';
  const batch: Batch = {
    id: '20260103',
    dir,
    invoices: [],
    attachments: [],
    groups: [],
    unidentified: [],
    diagnostics: [],
    manual: { version: 1, entries: [] },
    submitted: false,
  };
  const workspace: WorkspaceView = {
    kind: 'root',
    dir: root,
    openedDir: root,
    selectedBatchDir: null,
    rejected: null,
    batches: [
      {
        batch,
        report: buildReport(checkBatch(batch)),
        outputs: [],
        manualTasks: [],
        claim: defaultClaim('synthetic-view', '2026-01-01'),
        waived: 0,
        markedAt: null,
      },
    ],
    labor: [
      {
        report: checkLabor(
          {
            dir: laborDir,
            statements: [],
            attachments: [],
            diagnostics: [],
            manual: { version: 1, entries: [] },
          },
          loadConfig(),
        ),
        outputs: [],
      },
    ],
  };
  const noop = () => {};
  function Explorer() {
    const [selected, select] = useState<string | null>(null);
    return (
      <>
        <Sidebar
          workspace={workspace}
          selected={selected}
          select={select}
          busy={false}
          settingsOpen={false}
          width={280}
          open={noop}
          refresh={noop}
          settings={noop}
          resize={noop}
          resized={noop}
        />
        <output aria-label="所选路径">{selected}</output>
      </>
    );
  }
  render(<Explorer />);
  const tree = screen.getByRole('tree', { name: '工作区文件夹' });
  expect(within(tree).queryByRole('treeitem', { name: /劳务费/ })).toBeNull();
  const parent = within(tree).getByRole('treeitem', { name: /^20260103/ });
  fireEvent.click(parent);
  expect(parent.getAttribute('aria-expanded')).toBe('true');
  const branch = within(parent.parentElement!).getByRole('group');
  const labor = within(branch).getByRole('treeitem', { name: /劳务费/ });
  expect(labor.getAttribute('data-node-id')).toBe(laborDir);
  fireEvent.click(labor);
  expect(screen.getByLabelText('所选路径').textContent).toBe(laborDir);
});
