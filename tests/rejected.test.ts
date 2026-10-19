import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildRejectedInfo, readRejectedReasons } from '../src/core/rejected.js';
import { checkBatch } from '../src/core/index.js';
import { batch, invoice, line, config } from './helpers.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { syntheticPdf } from './pdf-fixture.js';

it('rejected 区分记录、推断和未记录；不把缺附件、解析告警当拒票原因', () => {
  const rejected = batch([
    invoice({ number: 'SYNTH-RECORDED' }),
    invoice({ number: 'SYNTH-INFERRED', lines: [line({ name: '文具' })] }),
    invoice({ number: 'SYNTH-UNKNOWN', total: 600, warnings: ['合成解析告警'] }),
    invoice({
      number: 'SYNTH-SERVICE',
      lines: [line({ taxCategory: '技术服务', name: '*技术服务*合成检测' })],
    }),
  ]);
  const info = buildRejectedInfo(rejected, config(), {
    'SYNTH-RECORDED': {
      number: 'SYNTH-RECORDED',
      reason: '合成原因',
      recordedAt: '2026-01-02T12:00:00Z',
      file: 'one.pdf',
    },
  });
  const result = checkBatch(rejected, config(), { rejectedInfo: info });
  expect(
    result.findings.find(
      (f) => f.ruleId === 'rejected' && f.invoiceNumbers.includes('SYNTH-RECORDED'),
    )?.message,
  ).toContain('原因：合成原因（记录于 2026-01-02）');
  expect(
    result.findings.find(
      (f) => f.ruleId === 'rejected' && f.invoiceNumbers.includes('SYNTH-INFERRED'),
    )?.message,
  ).toContain('可能原因（按规则推断）：F2');
  expect(
    result.findings.find(
      (f) => f.ruleId === 'rejected' && f.invoiceNumbers.includes('SYNTH-UNKNOWN'),
    )?.message,
  ).toContain('未记录原因');
  expect(
    result.findings
      .filter((f) => f.ruleId === 'rejected')
      .every((f) => f.action.includes('移出本批')),
  ).toBe(true);
});

it('拒票只允许 reasons.json 原子写入，保存更新批次提示，拒绝目录/文件符号链接', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-rejected-')));
  const root = join(temp, 'root');
  const reference = join(root, '无法报销费用');
  const dir = join(root, '20260102');
  try {
    await mkdir(reference, { recursive: true });
    await mkdir(dir);
    await writeFile(join(reference, '拒票.pdf'), syntheticPdf());
    await writeFile(join(dir, '本次.pdf'), syntheticPdf());
    const service = new WorkspaceService(new DesktopStore(join(temp, 'user-data')));
    let view = await service.open(root);
    const number = view.rejected!.batch.invoices[0]!.number;
    view = await service.saveRejectedReason(number, '合成原因');
    expect(
      view.batches[0]!.report.findings.find((f) => f.ruleId === 'rejected')?.message,
    ).toContain('原因：合成原因');
    const reasons = await readRejectedReasons(reference);
    expect(reasons[number]!.file).toBe('拒票.pdf');
    expect(
      JSON.parse(await readFile(join(reference, '_预检/reasons.json'), 'utf8'))[number].reason,
    ).toBe('合成原因');
    await expect(service.export(reference)).rejects.toThrow('只读');
    await expect(service.saveRejectedReason('SYNTH-NOT-SCANNED', 'unknown')).rejects.toThrow();
    await expect(service.saveRejectedReason(number, '')).rejects.toThrow();
    await rm(join(reference, '_预检'), { recursive: true });
    const external = join(temp, 'outside');
    await mkdir(external);
    const outside = join(external, 'reasons.json');
    await writeFile(outside, '{}');
    await symlink(
      external,
      join(reference, '_预检'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(service.saveRejectedReason(number, '不得写入')).rejects.toThrow('符号链接');
    expect(await readFile(outside, 'utf8')).toBe('{}');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it('没有记录的特殊号码不会误取对象原型作为原因', () => {
  const b = batch([invoice({ number: 'constructor' })]);
  expect(buildRejectedInfo(b, config()).get('constructor')?.recorded).toBeUndefined();
});
