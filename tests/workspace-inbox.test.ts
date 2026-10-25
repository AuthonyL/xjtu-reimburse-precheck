import { expect, it } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';

it('工作区收件箱忽略、撤销、未识别文件分类串联且拒绝跨批操作', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-workspace-inbox-')));
  try {
    const dir = join(temp, '20260102');
    await mkdir(join(dir, '组'), { recursive: true });
    await mkdir(join(temp, '无法报销费用'));
    await writeFile(join(dir, '组/abcdef.jpg'), 'synthetic');
    await writeFile(join(dir, '组/unknown.bin'), 'synthetic');
    const service = new WorkspaceService(new DesktopStore(join(temp, '.user-data')));
    expect(await service.inbox()).toEqual([]);
    await service.open(temp);
    expect((await service.inbox()).map((i) => [i.relativePath, i.kind])).toEqual([
      ['组/unknown.bin', 'unidentified'],
      ['组/abcdef.jpg', 'unnamed'],
    ]);
    await service.ignoreFile(dir, '组/unknown.bin');
    expect((await service.inbox()).map((i) => i.relativePath)).toEqual(['组/abcdef.jpg']);
    await service.unignoreFile(dir, '组/unknown.bin');
    expect(await service.inbox()).toHaveLength(2);
    await service.confirm(dir, '组/unknown.bin', 'payment');
    expect((await service.inbox()).map((i) => i.relativePath)).toEqual(['组/abcdef.jpg']);
    expect(
      service
        .batch(dir)
        .batch.attachments.some((a) => a.relativePath === '组/unknown.bin' && a.type === 'payment'),
    ).toBe(true);
    await expect(service.ignoreFile(dir, '组/unknown.bin')).rejects.toThrow('未识别');
    await expect(service.ignoreFile(join(temp, '无法报销费用'), '组/abcdef.jpg')).rejects.toThrow(
      '只读',
    );
    await expect(service.unignoreFile(dir, '../outside.jpg')).rejects.toThrow('相对路径');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
