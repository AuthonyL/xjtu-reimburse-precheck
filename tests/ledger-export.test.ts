import { expect, it } from 'vitest';
import { mkdtemp, readFile, realpath, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { createExampleWorkspace } from '../scripts/lib/example-workspace.js';

it('台账写到工作区根目录，元数据和登记记录可回读，允许显示该文件', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'ledger-export-')));
  try {
    const sample = await createExampleWorkspace(temp);
    const service = new WorkspaceService(new DesktopStore(sample.userData));
    await expect(service.exportLedger()).rejects.toThrow('请先选择文件夹');
    await service.open(sample.batch);
    await service.updateClaim(sample.batch, {
      claimant: '合成|经办\n人',
      project: '合成项目',
      fund: 'horizontal',
    });
    await service.transitionClaim(sample.batch, 'ready');
    const file = await service.exportLedger();
    expect(file).toBe(join(sample.root, '_预检/台账.md'));
    const text = await readFile(file, 'utf8');
    expect(text).toContain('## 报销单');
    expect(text).toContain('## 发票登记簿');
    expect(text).toContain('合成 经办 人');
    expect(text).toContain('合成项目 | 横向');
    expect(text).toContain('待提交');
    expect(text).toContain('SYNTH-EXAMPLE-A');
    expect(text).not.toContain(sample.root);
    expect(await service.allowedFile(file)).toBe(file);
    expect((await service.refresh()).batches).toHaveLength(2);
    expect((await service.open(sample.root)).batches).toHaveLength(2);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
it.skipIf(process.platform === 'win32')('台账输出拒绝符号链接目录或文件', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'ledger-links-')));
  try {
    const sample = await createExampleWorkspace(temp);
    const service = new WorkspaceService(new DesktopStore(sample.userData));
    await service.open(sample.root);
    const elsewhere = join(temp, 'elsewhere');
    await mkdir(elsewhere);
    await symlink(elsewhere, join(sample.root, '_预检'));
    await expect(service.exportLedger()).rejects.toThrow('符号链接');
    await rm(join(sample.root, '_预检'));
    await mkdir(join(sample.root, '_预检'));
    await symlink(join(elsewhere, 'target.md'), join(sample.root, '_预检/台账.md'));
    await expect(service.exportLedger()).rejects.toThrow('符号链接');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
