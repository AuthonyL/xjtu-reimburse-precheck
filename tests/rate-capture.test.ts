import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveRateCapture } from '../src/main/rate-capture.js';
import { DesktopStore } from '../src/main/store.js';
import { WorkspaceService } from '../src/main/workspace.js';

it('嵌套在组子目录里的收据也能找到当前组生成的汇率截图', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-nested-rate-')));
  try {
    const dir = join(temp, '20260102');
    await mkdir(join(dir, 'AI/nested'), { recursive: true });
    await writeFile(join(dir, 'AI/nested/收据.jpg'), 'synthetic');
    await saveRateCapture(
      dir,
      {
        group: 'AI',
        sourceFile: 'AI/nested/收据.jpg',
        currency: 'USD',
        amount: 20,
        paymentDate: '2026-01-02',
        exchangeRateType: '现汇买入价',
      },
      { value: 700, date: '2026-01-02', currencyName: '美元', rateType: '现汇买入价' },
      Buffer.from('synthetic-png'),
    );
    const service = new WorkspaceService(new DesktopStore(join(temp, 'user-data')));
    const view = await service.open(dir);
    const requirement = view.batches[0]!.report.groups[0]!.requirements.find(
      (r) => r.type === 'exchangeRate',
    )!;
    expect(requirement.status).toBe('found');
    expect(requirement.foundFiles).toHaveLength(1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('截图写输出目录，manual 保持 core 格式，重查后按组找到汇率截图', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-rate-capture-')));
  try {
    const dir = join(temp, '20260102');
    await mkdir(join(dir, 'AI'), { recursive: true });
    const entry = {
      group: 'AI',
      number: 'SYNTH-USD',
      currency: 'USD',
      amount: 20,
      paymentDate: '2026-01-02',
      exchangeRateType: '现汇买入价',
    };
    const service = new WorkspaceService(new DesktopStore(join(temp, 'user-data')));
    await service.open(dir);
    // 空文件夹不由 core 建组，先从 UI 手填入口使用的附件建立组。
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'AI/订阅说明.jpg'), 'synthetic');
    await service.refresh();
    const selection = {
      value: 700,
      date: '2026-01-02',
      currencyName: '美元',
      rateType: '现汇买入价',
    };
    const file = await saveRateCapture(dir, entry, selection, Buffer.from('synthetic-png'));
    expect(file).toContain('汇率-2026-01-02-USD.png');
    const manual = JSON.parse(await readFile(join(dir, '_预检/manual.json'), 'utf8'));
    expect(manual.entries[0].exchangeRate).toBe(7);
    expect(manual.entries[0].rateBase).toBe(1);
    const view = await service.refresh();
    expect(view.batches[0]!.report.totalCny).toBe(140);
    const requirement = view.batches[0]!.report.groups[0]!.requirements.find(
      (r) => r.type === 'exchangeRate',
    )!;
    expect(requirement.status).toBe('found');
    expect(requirement.foundFiles[0]!.path).toBe(file);
    await service.manual(view.batches[0]!.batch.dir, { ...entry, exchangeRate: 7.1, rateBase: 1 });
    const changed = await service.refresh();
    expect(
      changed.batches[0]!.report.groups[0]!.requirements.find((r) => r.type === 'exchangeRate')!
        .status,
    ).toBe('missing');
    await expect(
      saveRateCapture(
        dir,
        { ...entry, group: '其他组', number: 'SYNTH-OTHER' },
        { ...selection, value: 701 },
        Buffer.from('other'),
      ),
    ).rejects.toThrow('其他组');
    expect((await readFile(file)).toString()).toBe('synthetic-png');
    await expect(
      saveRateCapture(dir, { ...entry, paymentDate: '../bad' }, selection, Buffer.from('bad')),
    ).rejects.toThrow();
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
