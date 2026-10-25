import { expect, it } from 'vitest';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExampleWorkspace } from '../scripts/lib/example-workspace.js';
import { examplePng } from '../scripts/lib/example-documents.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import {
  emptyFilter,
  filterInvoices,
  invoiceRows,
  invoiceSummary,
} from '../src/renderer/src/invoices/invoice-rows.js';

it('真实工作区将唯一未命名 PNG 分类为支付记录，发票列表跟随报销状态刷新', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'workspace-pages-')));
  try {
    const sample = await createExampleWorkspace(temp);
    await rm(join(sample.batch, 'PCB/abcdef0123456789.jpg'));
    await writeFile(join(sample.batch, 'PCB/未命名.png'), examplePng);
    const service = new WorkspaceService(new DesktopStore(sample.userData));
    await service.open(sample.root);
    expect(await service.inbox()).toMatchObject([
      { relativePath: 'PCB/未命名.png', group: 'PCB', kind: 'unnamed', suggestions: [] },
    ]);
    const classified = await service.confirm(sample.batch, 'PCB/未命名.png', 'payment');
    expect(await service.inbox()).toEqual([]);
    expect(
      classified.batches[0]!.report.groups.find(
        (group) => group.group.name === 'PCB',
      )!.requirements.find((requirement) => requirement.type === 'payment')!.status,
    ).toBe('found');
    expect(invoiceSummary(invoiceRows(classified).regular)).toEqual({
      count: 4,
      cny: 1913,
      foreign: 0,
    });
    await service.transitionClaim(sample.batch, 'ready');
    const submitted = await service.transitionClaim(sample.batch, 'submitted');
    const rows = filterInvoices(
      invoiceRows(submitted).regular,
      { ...emptyFilter, keyword: '合成', states: ['submitted'] },
      { column: 'date', direction: 'descending' },
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.batchDir === sample.batch)).toBe(true);
    expect(invoiceRows(submitted).reference).toHaveLength(1);
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
