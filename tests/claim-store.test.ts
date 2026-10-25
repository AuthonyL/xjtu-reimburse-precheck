import { expect, it } from 'vitest';
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
  mkdir,
  stat,
  symlink,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultClaim, validateClaim } from '../src/core/domain/claim.js';
import { CLAIM_FILE, readClaimFile } from '../src/core/claim-store.js';
import {
  ensureClaim,
  transitionClaim,
  updateClaimMeta,
  setWaiver,
  removeWaiver,
} from '../src/main/claim-store.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';

it('首次生成完整报销单，并发及再次读取保持相同身份', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'precheck-claim-')));
  try {
    const claims = await Promise.all(Array.from({ length: 4 }, () => ensureClaim(dir)));
    const saved = JSON.parse(await readFile(join(dir, CLAIM_FILE), 'utf8'));
    expect(saved).toEqual(claims[0]);
    expect(saved).toEqual(defaultClaim(saved.id, saved.createdAt));
    expect(saved.id).toMatch(/^[\da-f-]{36}$/);
    expect(Number.isNaN(Date.parse(saved.createdAt))).toBe(false);
    expect(new Set(claims.map((c) => c.id)).size).toBe(1);
    expect(await ensureClaim(dir)).toEqual(saved);
    const updated = {
      ...saved,
      state: 'submitted',
      claimant: '合成申请人',
      waivers: [{ findingId: 'synthetic', reason: '合成理由', at: '2026-01-03' }],
    };
    await writeFile(join(dir, CLAIM_FILE), JSON.stringify(updated));
    expect(await ensureClaim(dir)).toEqual(updated);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('并发状态、元数据与豁免写入读取最新版本，拒绝空理由和非法元数据', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'precheck-claim-edits-')));
  try {
    const original = await ensureClaim(dir);
    await Promise.all([
      transitionClaim(dir, 'ready'),
      updateClaimMeta(dir, { claimant: '合成申请人', project: '合成项目', fund: 'vertical' }),
      setWaiver(dir, 'finding-a', '材料已线下核对'),
      setWaiver(dir, 'finding-b', '合成理由'),
    ]);
    const saved = await ensureClaim(dir);
    expect(saved).toMatchObject({
      id: original.id,
      state: 'ready',
      claimant: '合成申请人',
      fund: 'vertical',
    });
    expect(saved.waivers.map((w) => w.findingId)).toEqual(['finding-a', 'finding-b']);
    await setWaiver(dir, 'finding-a', '替换理由');
    expect((await ensureClaim(dir)).waivers).toHaveLength(2);
    await removeWaiver(dir, 'finding-a');
    expect((await ensureClaim(dir)).waivers.map((w) => w.findingId)).toEqual(['finding-b']);
    await expect(setWaiver(dir, 'finding-c', '  ')).rejects.toThrow('理由');
    await expect(updateClaimMeta(dir, { fund: 'bad' as 'other' })).rejects.toThrow('经费');
    await expect(transitionClaim(dir, 'reimbursed')).rejects.toThrow('迁移');
    expect((await ensureClaim(dir)).state).toBe('ready');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('损坏 JSON 和错误形状抛中文错误且不覆盖原文件', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'precheck-claim-invalid-')));
  try {
    await mkdir(join(dir, '_预检'));
    for (const raw of ['{', 'null', '{"version":2}', '{"version":1,"state":"unknown"}']) {
      await writeFile(join(dir, CLAIM_FILE), raw);
      await expect(ensureClaim(dir)).rejects.toThrow(/[\u4e00-\u9fff]/);
      expect(await readFile(join(dir, CLAIM_FILE), 'utf8')).toBe(raw);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('形状校验覆盖状态、流转、可选字段与豁免，不执行状态机', () => {
  const claim = defaultClaim('claim-synthetic', '2026-01-02T00:00:00.000Z');
  expect(readClaimFile(undefined)).toBeNull();
  expect(readClaimFile(claim)).toEqual(claim);
  expect(
    validateClaim({
      ...claim,
      claimant: '合成申请人',
      project: '合成项目',
      fund: 'horizontal',
      transitions: [{ from: 'submitted', to: 'returned', at: '2026-01-03', note: '合成退回' }],
      waivers: [{ findingId: 'finding-synthetic', reason: '合成理由', at: '2026-01-03' }],
    }).fund,
  ).toBe('horizontal');
  for (const value of [
    null,
    [],
    { ...claim, version: 2 },
    { ...claim, id: '' },
    { ...claim, state: 'unknown' },
    { ...claim, transitions: {} },
    { ...claim, transitions: [{ from: 'draft', to: 'unknown', at: 'now' }] },
    { ...claim, transitions: [{ from: 'draft', to: 'ready', at: 1 }] },
    { ...claim, transitions: [{ from: 'draft', to: 'ready', at: 'now', note: 1 }] },
    { ...claim, claimant: 1 },
    { ...claim, project: [] },
    { ...claim, fund: 'unknown' },
    { ...claim, fund: ['horizontal'] },
    { ...claim, waivers: null },
    { ...claim, waivers: [{ findingId: '', reason: '理由', at: 'now' }] },
    { ...claim, waivers: [{ findingId: 'f', reason: 1, at: 'now' }] },
    { ...claim, waivers: [{ findingId: 'f', reason: '理由', at: null }] },
  ])
    expect(() => validateClaim(value)).toThrow(/[\u4e00-\u9fff]/);
});

it('构建批次视图附带 Claim，刷新不改变报告且拒票参考目录不写入', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'precheck-claim-workspace-')));
  try {
    const batchDir = join(dir, '20260102');
    const rejectedDir = join(dir, '无法报销费用');
    await mkdir(join(batchDir, 'AI'), { recursive: true });
    await mkdir(rejectedDir);
    await writeFile(join(batchDir, 'AI/订阅说明.jpg'), 'synthetic');
    const service = new WorkspaceService(new DesktopStore(join(dir, '.user-data')));
    const before = await service.open(dir);
    const after = await service.refresh();
    expect(before.batches[0]!.batch.claim?.id).toBeTruthy();
    expect(after.batches[0]!.batch.claim).toEqual(before.batches[0]!.batch.claim);
    expect(after.batches[0]!.report).toEqual(before.batches[0]!.report);
    expect(after.rejected?.readOnly).toBe(true);
    expect(after.rejected?.batch.claim).toBeUndefined();
    await expect(stat(join(rejectedDir, '_预检'))).rejects.toMatchObject({ code: 'ENOENT' });
    const reference = await service.open(rejectedDir);
    expect(reference.rejected?.batch.claim).toBeUndefined();
    await expect(stat(join(rejectedDir, '_预检'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('Claim 写入拒绝跟随输出目录符号链接', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'precheck-claim-link-')));
  try {
    await mkdir(join(dir, 'batch'));
    await mkdir(join(dir, 'outside'));
    await symlink(join(dir, 'outside'), join(dir, 'batch/_预检'), 'junction');
    await expect(ensureClaim(join(dir, 'batch'))).rejects.toThrow('符号链接');
    await expect(stat(join(dir, 'outside/claim.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('首次创建 Claim 不改变按目录修改日期推断的批次日期', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'precheck-claim-date-')));
  try {
    const batchDir = join(dir, '合成批次');
    await mkdir(batchDir);
    await writeFile(join(batchDir, '订阅说明.jpg'), 'synthetic');
    const originalTime = new Date('2026-01-02T12:00:00.000Z');
    await utimes(batchDir, originalTime, originalTime);
    const store = new DesktopStore(join(dir, '.user-data'));
    const service = new WorkspaceService(store);
    const before = await service.open(batchDir);
    expect(before.batches[0]!.batch.dir).toBe(batchDir);
    expect(before.batches[0]!.batch.batchDateSource).toBe('modified');
    expect(before.batches[0]!.batch.batchDate).toBe('2026-01-02');
    expect((await stat(batchDir)).mtimeMs).toBe(originalTime.getTime());
    const refreshed = await service.refresh();
    const reopened = await new WorkspaceService(store).open(batchDir);
    for (const view of [refreshed, reopened]) {
      expect(view.batches[0]!.batch.batchDate).toBe('2026-01-02');
      expect(view.batches[0]!.report).toEqual(before.batches[0]!.report);
      expect(view.batches[0]!.batch.claim).toEqual(before.batches[0]!.batch.claim);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
