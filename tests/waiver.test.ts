import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countSeverities, buildReport } from '../src/core/report.js';
import { renderMarkdown } from '../src/core/export/markdown.js';
import { defaultClaim } from '../src/core/domain/claim.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { batch, config, finding } from './helpers.js';
import { checkBatch } from '../src/core/rules/engine.js';

it('豁免保留问题但排除严重级和材料计数，汇总末尾含规则、概述与理由', () => {
  const b = batch([], 'AI');
  const result = checkBatch(b, config());
  const target = result.findings.find((f) => f.requirementType === 'payment')!;
  const before = buildReport(result);
  b.claim = {
    ...defaultClaim('waiver-test', '2026-01-01'),
    waivers: [{ findingId: target.id, reason: '已核对纸质支付凭证', at: '2026-01-02' }],
  };
  target.resolution = 'waived';
  const report = buildReport(result);
  expect(report.findings).toHaveLength(before.findings.length);
  expect(report.requirementCounts.total).toBe(before.requirementCounts.total - 1);
  expect(report.groups[0]!.requirementCounts.total).toBe(
    before.groups[0]!.requirementCounts.total - 1,
  );
  expect(
    countSeverities([
      finding({ severity: 'error', resolution: 'waived' }),
      finding({ severity: 'warning' }),
    ]),
  ).toEqual({ error: 0, warning: 1, info: 0 });
  const md = renderMarkdown(report);
  expect(md).toContain('## 已豁免问题');
  expect(md.split('## 已豁免问题')[1]).toContain(target.ruleId);
  expect(md.split('## 已豁免问题')[1]).toContain(target.message);
  expect(md.split('## 已豁免问题')[1]).toContain('已核对纸质支付凭证');
  expect(md.split('## 检查提示')[1]!.split('## 已豁免问题')[0]).not.toContain(target.message);
});

it('工作区豁免、导出、重开与撤销串联，未知问题及只读参考目录不可豁免', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-waiver-')));
  try {
    const dir = join(temp, '20260102');
    await mkdir(join(dir, 'AI'), { recursive: true });
    await mkdir(join(temp, '无法报销费用'));
    await writeFile(join(dir, 'AI/说明.jpg'), 'synthetic');
    const store = new DesktopStore(join(temp, '.user-data'));
    const service = new WorkspaceService(store);
    const first = (await service.open(temp)).batches[0]!;
    const target = first.report.findings.find((f) => f.severity !== 'info')!;
    await expect(service.waiveFinding(dir, 'not-a-finding', '理由')).rejects.toThrow('问题');
    await expect(
      service.waiveFinding(join(temp, '无法报销费用'), target.id, '理由'),
    ).rejects.toThrow('只读');
    const next = (await service.waiveFinding(dir, target.id, '已线下核对')).batches[0]!;
    expect(next.waived).toBe(1);
    expect(next.report.findings.find((f) => f.id === target.id)?.resolution).toBe('waived');
    await service.export(dir);
    expect(await readFile(join(dir, '_预检/汇总.md'), 'utf8')).toContain('已线下核对');
    const reopened = (await new WorkspaceService(store).open(dir)).batches[0]!;
    expect(reopened.waived).toBe(1);
    const undone = (await service.unwaiveFinding(dir, target.id)).batches[0]!;
    expect(undone.waived).toBe(0);
    expect(undone.report.findings.find((f) => f.id === target.id)?.resolution).not.toBe('waived');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
