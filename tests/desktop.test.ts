import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectWorkspace, manualPath } from '../src/main/paths.js';
import { DesktopStore, DEFAULT_BOC_URL } from '../src/main/store.js';
import { saveAttachment, saveManualEntry } from '../src/main/manual-store.js';
import { readManual } from '../src/core/manual.js';

const dirs: string[] = [];
async function temporary() {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'precheck-desktop-unit-')));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

it('识别根目录、单批次及兄弟批次上下文，忽略 tmp', async () => {
  const root = await temporary();
  for (const d of ['20260101', '20260102', 'tmp/20260103', '无法报销费用'])
    await mkdir(path.join(root, d), { recursive: true });
  expect(await detectWorkspace(root)).toEqual({ kind: 'root', dir: root, contextRoot: root });
  expect(await detectWorkspace(path.join(root, '20260101'))).toEqual({
    kind: 'batch',
    dir: path.join(root, '20260101'),
    contextRoot: root,
  });
  const standalone = await temporary();
  expect((await detectWorkspace(standalone)).contextRoot).toBeNull();
});

it('Windows manual 路径统一为 /，拒绝盘符外与向上越界', () => {
  expect(manualPath('C:\\批次', 'C:\\批次\\PCB\\a.jpg', path.win32)).toBe('PCB/a.jpg');
  expect(() => manualPath('C:\\批次', 'D:\\a.jpg', path.win32)).toThrow();
  expect(() => manualPath('C:\\批次', 'C:\\其他\\a.jpg', path.win32)).toThrow();
});

it('设置持久化并调用 core 校验，非法配置不覆盖原设置', async () => {
  const store = new DesktopStore(await temporary());
  const defaults = await store.settings();
  expect(defaults.bocUrl).toBe(DEFAULT_BOC_URL);
  defaults.rules.buyer.name = '合成大学';
  await store.saveSettings(defaults);
  expect((await store.settings()).rules.buyer.name).toBe('合成大学');
  defaults.rules.thresholds.inventory.value = -1;
  await expect(store.saveSettings(defaults)).rejects.toThrow('阈值');
  expect((await store.settings()).rules.thresholds.inventory.value).toBe(500);
  await expect(
    store.saveSettings({ ...(await store.settings()), bocUrl: 'https://evil.example/' }),
  ).rejects.toThrow('中行');
});

it('历史保留来源和时间，排除自身，撤销不删除其他批次同号标记', async () => {
  const store = new DesktopStore(await temporary());
  const a = path.join(await temporary(), '20260101');
  const b = path.join(path.dirname(a), '20260102');
  await store.mark(a, ['SYNTH-ONE', 'SYNTH-TWO']);
  await store.mark(b, ['SYNTH-ONE']);
  expect([...(await store.submitted(a))]).toEqual(['SYNTH-ONE']);
  const history = await store.history();
  expect(history[0]!.markedAt).toMatch(/^\d{4}-/);
  expect(history[0]!.batchDir).toBe(a);
  await store.unmark(b);
  expect([...(await store.submitted(a))]).toEqual([]);
  expect([...(await store.submitted(b))]).toHaveLength(2);
});

it('最近目录去重并保留顺序', async () => {
  const store = new DesktopStore(await temporary());
  const a = await temporary();
  const b = await temporary();
  await store.addRecent(a);
  await store.addRecent(b);
  await store.addRecent(a);
  expect(await store.recent()).toEqual([a, b]);
});

it('manual 写入保留附件及其他条目，同一条目更新不重复', async () => {
  const batch = await temporary();
  await mkdir(path.join(batch, 'PCB'));
  await writeFile(path.join(batch, 'PCB/a.jpg'), 'synthetic');
  await saveAttachment(batch, 'PCB/a.jpg', 'payment');
  const entry = {
    group: 'AI',
    number: 'SYNTH-MANUAL',
    currency: 'USD',
    amount: 20,
    paymentDate: '2026-01-02',
    exchangeRate: 7,
    rateBase: 1,
  };
  await saveManualEntry(batch, entry);
  await saveManualEntry(batch, { ...entry, amount: 30 });
  const manual = await readManual(batch);
  expect(manual.attachments).toEqual({ 'PCB/a.jpg': 'payment' });
  expect(manual.entries).toHaveLength(1);
  expect(manual.entries[0]!.amount).toBe(30);
  expect(JSON.parse(await readFile(path.join(batch, '_预检/manual.json'), 'utf8'))).toEqual(manual);
});

it('manual 拒绝越界、符号链接及非法输入且不损坏已有数据', async () => {
  const batch = await temporary();
  const outside = await temporary();
  await expect(saveAttachment(batch, '../bad.jpg', 'payment')).rejects.toThrow();
  await symlink(
    outside,
    path.join(batch, '_预检'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await expect(
    saveManualEntry(batch, { group: 'AI', currency: 'USD', amount: 20, paymentDate: '2026-01-02' }),
  ).rejects.toThrow('符号链接');
});
