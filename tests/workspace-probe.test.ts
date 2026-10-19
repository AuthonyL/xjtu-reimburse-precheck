import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { detectWorkspace } from '../src/main/paths.js';
import { candidateBatchDirectories, scanRootBatches } from '../src/core/discovery.js';
import { findLaborDirectories } from '../src/core/labor/scan.js';
import { loadConfig } from '../src/core/rules/config.js';
import { checkRoot } from '../src/core/index.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { xml } from './parse-fixtures.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});
const nativeReaddir = vi.mocked(fs.readdir).getMockImplementation()!;
const temps: string[] = [];
afterEach(async () => {
  vi.mocked(fs.readdir).mockImplementation(nativeReaddir);
  for (const dir of temps.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const temp = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'workspace-probe-')));
  temps.push(temp);
  const root = join(temp, 'root');
  for (const folder of [
    '20260101',
    '20260102',
    '系统目录',
    '劳务费',
    '无法报销费用',
    '20260101/不可读子组',
  ])
    await fs.mkdir(join(root, folder), { recursive: true });
  await fs.writeFile(join(root, '20260101/票.xml'), xml);
  await fs.writeFile(join(root, '20260102/票.xml'), xml.replace('SYNTH-001', 'SYNTH-002'));
  return { temp, root };
}
function unreadable(dirs: string[], code: string) {
  vi.mocked(fs.readdir).mockImplementation(async (dir, options) => {
    if (dirs.includes(resolve(String(dir)))) throw Object.assign(new Error(code), { code });
    return Reflect.apply(nativeReaddir, fs, [dir, options]);
  });
}
it.each(['EACCES', 'EPERM', 'EBUSY', 'ENOENT'])(
  '探测跳过 %s 的兄弟目录和嵌套目录，保留可读批次',
  async (code) => {
    const { temp, root } = await fixture();
    unreadable(
      [
        join(root, '系统目录'),
        join(root, '劳务费'),
        join(root, '无法报销费用'),
        join(root, '20260101/不可读子组'),
      ],
      code,
    );
    expect((await detectWorkspace(join(root, '20260101'))).contextRoot).toBe(root);
    expect((await scanRootBatches(root, loadConfig())).map((b) => b.id).sort()).toEqual([
      '20260101',
      '20260102',
    ]);
    const view = await new WorkspaceService(new DesktopStore(join(temp, 'userdata'))).open(root);
    expect(view.batches).toHaveLength(2);
    expect((await checkRoot(root)).batches).toHaveLength(2);
  },
);
it.each(['EACCES', 'EPERM', 'EBUSY', 'ENOENT'])(
  '用户选择的目录读取失败 %s 时给出中文错误，探测同目录则跳过',
  async (code) => {
    const { root } = await fixture();
    unreadable([root], code);
    await expect(detectWorkspace(root)).rejects.toThrow(/无法读取所选文件夹/);
    expect(await candidateBatchDirectories(root, loadConfig())).toEqual([]);
    expect(await findLaborDirectories(root, loadConfig())).toEqual([]);
  },
);
it('不能吞掉未知文件系统错误', async () => {
  const { root } = await fixture();
  unreadable([root], 'EIO');
  await expect(candidateBatchDirectories(root, loadConfig())).rejects.toMatchObject({
    code: 'EIO',
  });
});
it.each(['EACCES', 'EPERM', 'EBUSY', 'ENOENT'])(
  '非日期父目录探测跳过 %s 的兄弟目录，父目录自身不可读时不关联上下文',
  async (code) => {
    const { temp } = await fixture();
    const root = join(temp, '非日期根');
    for (const name of ['甲批', '乙批', '系统目录']) {
      await fs.mkdir(join(root, name), { recursive: true });
      await fs.writeFile(join(root, name, '票.xml'), xml);
    }
    unreadable([join(root, '系统目录')], code);
    expect((await detectWorkspace(join(root, '甲批'))).contextRoot).toBe(root);
    unreadable([root], code);
    expect((await detectWorkspace(join(root, '甲批'))).contextRoot).toBeNull();
  },
);
it('单独批次的杂物父目录不会成为工作区', async () => {
  const { temp } = await fixture();
  const parent = join(temp, '普通目录');
  for (const folder of ['单独批次', '旧照片', '工具'])
    await fs.mkdir(join(parent, folder), { recursive: true });
  await fs.writeFile(join(parent, '单独批次/票.xml'), xml);
  await fs.writeFile(join(parent, '旧照片/照片.jpg'), 'synthetic');
  await fs.writeFile(join(parent, '工具/README.txt'), 'synthetic');
  await fs.writeFile(join(parent, '散文件.txt'), 'synthetic');
  expect(await detectWorkspace(join(parent, '单独批次'))).toMatchObject({
    kind: 'batch',
    contextRoot: null,
  });
});
it('非日期工作区中的空兄弟目录仍被忽略，不妨碍关联上下文', async () => {
  const { temp } = await fixture();
  const root = join(temp, '非日期根');
  for (const name of ['甲批', '乙批', '空目录'])
    await fs.mkdir(join(root, name), { recursive: true });
  for (const name of ['甲批', '乙批']) await fs.writeFile(join(root, name, '票.xml'), xml);
  expect((await detectWorkspace(join(root, '甲批'))).contextRoot).toBe(root);
});
it('自身已有多个批次时优先作为根目录，空目录不从父目录借用批次', async () => {
  const { temp } = await fixture();
  const root = join(temp, '普通父目录');
  await fs.mkdir(join(root, '另一个目录'), { recursive: true });
  await fs.writeFile(join(root, '另一个目录/照片.jpg'), 'synthetic');
  await fs.mkdir(join(root, '非日期根/甲批'), { recursive: true });
  await fs.mkdir(join(root, '非日期根/乙批'), { recursive: true });
  await fs.writeFile(join(root, '非日期根/甲批/票.xml'), xml);
  await fs.writeFile(join(root, '非日期根/乙批/票.xml'), xml);
  expect(await detectWorkspace(join(root, '非日期根'))).toMatchObject({
    kind: 'root',
    contextRoot: join(root, '非日期根'),
  });
  await fs.mkdir(join(root, '空目录'));
  expect((await detectWorkspace(join(root, '空目录'))).contextRoot).toBeNull();
});
