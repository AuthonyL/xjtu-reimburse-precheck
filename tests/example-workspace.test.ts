import { it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExampleWorkspace } from '../scripts/lib/example-workspace.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';

it('截图数据只含合成内容，根目录有两个批次、劳务和拒票，可直接打开', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'example-workspace-test-'));
  try {
    const example = await createExampleWorkspace(temp);
    const workspace = await new WorkspaceService(new DesktopStore(example.userData)).open(
      example.root,
    );
    expect(workspace.batches.map((b) => b.batch.id)).toEqual(['20260103', '20260102']);
    expect(workspace.batches[0]!.report.invoiceCount).toBe(3);
    expect(workspace.labor?.[0]?.report.entries).toHaveLength(2);
    expect(workspace.rejected?.batch.invoices).toHaveLength(1);
    expect(await readFile(join(example.batch, 'PCB/发票甲.xml'), 'utf8')).toContain(
      'SYNTH-EXAMPLE-A',
    );
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
