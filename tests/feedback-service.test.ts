import { it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FeedbackService } from '../src/main/feedback-service.js';
import { FeedbackStore } from '../src/main/feedback-store.js';
import { DesktopStore, DEFAULT_BOC_URL } from '../src/main/store.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { feedbackProblemKey } from '../src/shared/feedback.js';
import { config } from './helpers.js';
import { xml } from './parse-fixtures.js';
it('只接受当前真实问题、记录相对路径/末六位号；预览原件默认不含，阻止写工作区与符号链接', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'feedback-service-')));
  const root = join(temp, 'workspace');
  const dir = join(root, '20260102');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '发票.xml'), xml.replace('*电子元件*连接头', '*文具*连接头'));
  const store = new DesktopStore(join(temp, 'data'));
  await store.saveSettings({ bocUrl: DEFAULT_BOC_URL + '?synthetic=1', rules: config() });
  const workspace = new WorkspaceService(store);
  const view = await workspace.open(root);
  const service = new FeedbackService(new FeedbackStore(store.dir), workspace, 'synthetic');
  const finding = view.batches[0]!.report.findings.find((f) => f.invoiceNumbers.length)!;
  expect(finding).toBeTruthy();
  await expect(
    service.mark({ directory: dir, problemKey: 'forged', type: 'unclear', note: '坏反馈' }),
  ).rejects.toThrow(/变化/);
  await expect(
    service.mark({
      directory: join(root, '无法报销费用'),
      problemKey: 'forged',
      type: 'unclear',
      note: '坏反馈',
    }),
  ).rejects.toThrow(/当前/);
  const input = {
    directory: dir,
    problemKey: feedbackProblemKey(finding, dir),
    type: 'unclear' as const,
    note: '合成反馈',
  };
  const state = await service.mark(input);
  expect(state.records[0]!.directory).toBe('20260102');
  expect(state.records[0]!.files).toEqual(['20260102/发票.xml']);
  expect(state.records[0]!.invoices[0]!.numberSuffix).toBe('TH-001');
  expect(await readFile(join(store.dir, 'feedback.json'), 'utf8')).not.toContain(root);
  const preview = await service.prepare(false);
  expect(preview.files.some((f) => f.path.startsWith('files/'))).toBe(false);
  await expect(service.save(preview.token, join(dir, '禁止.zip'))).rejects.toThrow(/工作区以外/);
  await symlink(dir, join(temp, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(service.save(preview.token, join(temp, 'alias', '禁止.zip'))).rejects.toThrow(
    /工作区以外/,
  );
  const path = join(temp, '反馈.zip');
  expect(await service.save(preview.token, path)).toBe(path);
  expect((await readFile(path)).length).toBeGreaterThan(0);
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await readFile(path));
  expect(JSON.parse(await zip.file('settings-diff.json')!.async('string'))).toContainEqual(
    expect.objectContaining({ path: 'bocUrl', currentValue: DEFAULT_BOC_URL + '?synthetic=1' }),
  );
  await expect(service.save(preview.token, path)).rejects.toThrow(/失效/);
});
