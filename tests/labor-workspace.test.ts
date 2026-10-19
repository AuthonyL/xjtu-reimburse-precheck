import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Document, Packer, Paragraph } from 'docx';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { buildWorkspaceTree } from '../src/shared/navigation.js';
import { laborText } from './labor-fixtures.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function fixture() {
  const tmp = await realpath(await mkdtemp(join(tmpdir(), 'labor-workspace-')));
  dirs.push(tmp);
  const root = join(tmp, 'root');
  const labor = join(root, '劳务费');
  const nested = join(root, '20260101', '劳务费');
  for (const d of [labor, nested, join(root, '无法报销费用')]) await mkdir(d, { recursive: true });
  const bytes = await Packer.toBuffer(
    new Document({ sections: [{ children: [new Paragraph(laborText)] }] }),
  );
  for (const d of [labor, nested]) await writeFile(join(d, '说明.docx'), bytes);
  const service = new WorkspaceService(new DesktopStore(join(tmp, 'user-data')));
  return { tmp, root, labor, nested, service };
}
it('根和批次劳务独立显示、树位于拒票之前，直接打开恢复到劳务目录', async () => {
  const { root, labor, nested, service } = await fixture();
  const view = await service.open(root);
  expect(view.labor).toHaveLength(2);
  expect(view.batches[0]!.batch.unidentified).toEqual([]);
  const tree = buildWorkspaceTree(view);
  expect(tree.map((n) => n.label)).toEqual(['20260101', '劳务费', '无法报销费用']);
  expect(tree[0]!.children.find((n) => n.label === '劳务费')?.batchDir).toBe(nested);
  expect(tree[1]!.children[0]!.label).toBe('林示例');
  const direct = await service.open(labor);
  expect(direct.selectedBatchDir).toBe(labor);
  expect((await new WorkspaceService(service.store).restore()).workspace?.selectedBatchDir).toBe(
    labor,
  );
});
it('单独打开非日期批次也能发现深层劳务，发票扫描仍不混入它', async () => {
  const { tmp, service } = await fixture();
  const batch = join(tmp, '非日期批次');
  const labor = join(batch, '业务', '劳务费');
  await mkdir(labor, { recursive: true });
  await writeFile(
    join(labor, '说明.docx'),
    await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(laborText)] }] })),
  );
  const view = await service.open(batch);
  expect(view.labor?.map((l) => l.report.dir)).toEqual([labor]);
  expect(view.batches[0]?.batch.invoices).toEqual([]);
});
it('手填金额触发L2，导出到固定输出，文件打开只允许当前劳务源/输出', async () => {
  const { labor, root, service } = await fixture();
  await service.open(root);
  await mkdir(join(labor, '_预检'));
  await writeFile(
    join(labor, '_预检', 'manual.json'),
    JSON.stringify({ version: 1, entries: [], attachments: { '照片.jpg': 'payment' } }),
  );
  const updated = await service.saveLabor(labor, '说明.docx', { tableAmount: 2000 });
  expect(
    updated
      .labor!.find((l) => l.report.dir === labor)!
      .report.entries[0]!.findings.some((f) => f.ruleId === 'L2'),
  ).toBe(true);
  const data = JSON.parse(await readFile(join(labor, '_预检/manual.json'), 'utf8')) as {
    labor: Record<string, unknown>;
    attachments: Record<string, string>;
  };
  expect(data.attachments['照片.jpg']).toBe('payment');
  expect(data.labor['说明.docx']).toEqual({ tableAmount: 2000 });
  const output = await service.exportLabor(labor, '说明.docx', { tableAmount: 2200 });
  const file = join(labor, '_预检/情况说明-林示例.docx');
  expect(output.labor!.find((l) => l.report.dir === labor)!.outputs).toContain(file);
  expect((await stat(file)).isFile()).toBe(true);
  expect(await service.allowedFile(file)).toBe(file);
  await expect(service.saveLabor(root, '说明.docx', {})).rejects.toThrow();
  await expect(service.saveLabor(labor, '../说明.docx', {})).rejects.toThrow();
  await expect(service.allowedFile(join(labor, '_预检/manual.json'))).rejects.toThrow();
  await expect(service.export(labor)).rejects.toThrow();
});
it('劳务输出与来源符号链接拒绝写入，拒票后代不能变为可写劳务', async () => {
  const { tmp, labor, root, service } = await fixture();
  const outside = join(tmp, 'outside');
  await mkdir(outside);
  await service.open(root);
  await symlink(outside, join(labor, '_预检'), 'junction');
  await expect(service.saveLabor(labor, '说明.docx', { tableAmount: 1 })).rejects.toThrow(
    '符号链接',
  );
  await expect(service.exportLabor(labor, '说明.docx')).rejects.toThrow('符号链接');
  const rejected = join(root, '无法报销费用', '劳务费');
  await mkdir(rejected);
  await service.open(rejected);
  await expect(service.saveLabor(rejected, '说明.docx', {})).rejects.toThrow();
  await expect(stat(join(outside, 'manual.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});
