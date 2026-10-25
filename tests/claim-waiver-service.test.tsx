// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { Results } from '../src/renderer/src/Results.js';
import { useWorkspaceStore } from '../src/renderer/src/store/workspace.js';
import { seedWorkspace } from './store-helpers.js';

it('真实服务保存豁免理由并在撤销后恢复待处理问题', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'claim-renderer-')));
  try {
    const dir = join(temp, '20260102');
    await mkdir(join(dir, 'AI'), { recursive: true });
    await writeFile(join(dir, 'AI/abcdef.jpg'), 'synthetic image');
    const service = new WorkspaceService(new DesktopStore(join(temp, 'user-data')));
    const initial = await service.open(dir);
    const issue = initial.batches[0]!.report.findings.find((f) => f.severity !== 'info')!;
    Object.assign(window, {
      precheck: {
        waiveFinding: service.waiveFinding.bind(service),
        unwaiveFinding: service.unwaiveFinding.bind(service),
      },
    });
    function ServiceResults() {
      const current = useWorkspaceStore((state) => state.view!);
      return <Results view={current.batches[0]!} />;
    }
    seedWorkspace(initial);
    render(<ServiceResults />);
    const user = userEvent.setup();
    const summary = screen
      .getAllByRole('button')
      .find(
        (button) =>
          button.matches('[class*="_findingSummary_"]') &&
          button.textContent?.includes(issue.message),
      )!;
    await user.click(summary);
    await user.click(screen.getByRole('button', { name: '豁免…' }));
    await user.type(screen.getByRole('textbox', { name: '豁免理由' }), '  已核实合成材料  ');
    await user.click(screen.getByRole('button', { name: '保存豁免' }));
    await screen.findByRole('button', { name: '已豁免 1 条' });
    const stored = JSON.parse(await readFile(join(dir, '_预检/claim.json'), 'utf8'));
    expect(stored.waivers).toEqual([
      { findingId: issue.id, reason: '已核实合成材料', at: expect.any(String) },
    ]);
    expect(service.batch(dir).report.findings.find((f) => f.id === issue.id)?.resolution).toBe(
      'waived',
    );
    await user.click(screen.getByRole('button', { name: '已豁免 1 条' }));
    await user.click(screen.getByRole('button', { name: '撤销豁免' }));
    await screen.findByRole('button', { name: '豁免…' });
    expect(JSON.parse(await readFile(join(dir, '_预检/claim.json'), 'utf8')).waivers).toEqual([]);
    expect(service.batch(dir).report.findings.find((f) => f.id === issue.id)?.resolution).not.toBe(
      'waived',
    );
  } finally {
    cleanup();
    await rm(temp, { recursive: true, force: true });
  }
});
