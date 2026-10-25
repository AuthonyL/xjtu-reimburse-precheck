import { expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { defaultClaim, type ClaimState } from '../src/core/domain/claim.js';
import {
  submittedNumbers,
  type Registry,
  type RegistryEntry,
} from '../src/core/domain/registry.js';
import { CLAIM_FILE } from '../src/core/claim-store.js';
import type { Batch, Invoice } from '../src/core/types.js';
import { RegistryStore } from '../src/main/registry.js';

const at = '2026-01-02T00:00:00.000Z';
const hash = 'a'.repeat(64);
function entry(claimId: string, state: ClaimState, number = claimId): RegistryEntry {
  return {
    number,
    claimId,
    batchDir: '/synthetic/batch',
    state,
    seller: '合成销售方',
    total: 12.5,
    currency: 'CNY',
    date: '2026-01-02',
    seenAt: at,
  };
}
function invoice(number: string): Invoice {
  return {
    number,
    kind: 'domestic',
    invoiceType: 'digital',
    date: '2026-01-02',
    buyer: { name: '合成购买方', taxId: 'synthetic-buyer' },
    seller: { name: '合成销售方', taxId: 'synthetic-seller' },
    lines: [],
    total: 12.5,
    currency: 'CNY',
    sources: [],
    warnings: [],
  };
}
async function batch(
  dir: string,
  id: string,
  number: string,
  state: ClaimState = 'submitted',
): Promise<Batch> {
  const claim = { ...defaultClaim(id, at), state };
  await mkdir(dirname(join(dir, CLAIM_FILE)), { recursive: true });
  await writeFile(join(dir, CLAIM_FILE), JSON.stringify(claim));
  return {
    id,
    dir,
    claim,
    invoices: [invoice(number)],
    attachments: [],
    groups: [],
    unidentified: [],
    diagnostics: [],
    manual: { version: 1, entries: [] },
    submitted: state === 'submitted',
  };
}
async function temporary(test: (dir: string) => Promise<void>) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'precheck-registry-')));
  try {
    await test(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

it('仅已提交及已报销状态提供号码，并排除当前报销单身份', () => {
  const registry: Registry = {
    version: 1,
    entries: [
      entry('own', 'submitted', 'own-number'),
      entry('submitted', 'submitted', 'shared-number'),
      entry('reimbursed', 'reimbursed', 'paid-number'),
      entry('duplicate', 'submitted', 'shared-number'),
      ...(['draft', 'ready', 'returned', 'rejected', 'cancelled'] as const).map((s) => entry(s, s)),
    ],
  };
  expect([...submittedNumbers(registry, 'own')]).toEqual(['shared-number', 'paid-number']);
});

it('未创建缓存时只读返回空登记簿，不创建 userData', async () => {
  await temporary(async (dir) => {
    const userData = join(dir, 'missing/user-data');
    expect(await new RegistryStore(userData).read()).toEqual({ version: 1, entries: [] });
    await expect(stat(userData)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

it('系统临时目录别名下尚不存在的 userData 可读取及重建', async () => {
  const unresolved = await mkdtemp(join(tmpdir(), 'precheck-registry-alias-'));
  try {
    const dir = await realpath(unresolved);
    const store = new RegistryStore(join(unresolved, 'missing/user-data'));
    expect(await store.read()).toEqual({ version: 1, entries: [] });
    const current = await batch(join(dir, 'batch'), 'claim-alias', 'SYN-ALIAS');
    expect((await store.rebuild([current])).entries.map((e) => e.number)).toEqual(['SYN-ALIAS']);
    expect((await store.read()).entries.map((e) => e.number)).toEqual(['SYN-ALIAS']);
  } finally {
    await rm(unresolved, { recursive: true, force: true });
  }
});

it('重建保存发票快照、唯一来源校验和并忽略空号码', async () => {
  await temporary(async (dir) => {
    const current = await batch(join(dir, 'workspace/batch'), 'claim-current', 'SYN-001');
    current.invoices[0]!.sources = [
      { path: '/synthetic/a.xml', relativePath: 'a.xml', format: 'xml', sha256: hash },
      { path: '/synthetic/a.pdf', relativePath: 'a.pdf', format: 'pdf', sha256: hash },
    ];
    current.invoices.push(invoice(''));
    const store = new RegistryStore(join(dir, 'user-data'));
    const rebuilt = await store.rebuild([current]);
    expect(rebuilt.entries).toEqual([
      {
        ...entry('claim-current', 'submitted', 'SYN-001'),
        batchDir: current.dir,
        sha256: [hash],
        seenAt: expect.any(String),
      },
    ]);
    expect(Number.isNaN(Date.parse(rebuilt.entries[0]!.seenAt))).toBe(false);
    expect(await store.read()).toEqual(rebuilt);
    expect(JSON.parse(await readFile(join(dir, 'user-data/registry.json'), 'utf8'))).toEqual(
      rebuilt,
    );
  });
});

it('目录改名按 claimId 更新，旧号码消失且历史判重号不丢失', async () => {
  await temporary(async (dir) => {
    const store = new RegistryStore(join(dir, 'user-data'));
    const historical = await batch(join(dir, 'older/batch'), 'claim-old', 'SYN-OLD');
    const current = await batch(join(dir, 'root/before'), 'claim-current', 'SYN-BEFORE');
    await store.rebuild([historical, current]);
    const renamed = join(dir, 'root/after');
    await rename(current.dir, renamed);
    current.dir = renamed;
    current.invoices = [invoice('SYN-AFTER')];
    const result = await store.rebuild([current]);
    expect(result.entries.map((e) => [e.claimId, e.number, e.batchDir])).toEqual([
      ['claim-old', 'SYN-OLD', historical.dir],
      ['claim-current', 'SYN-AFTER', renamed],
    ]);
    expect([...submittedNumbers(result, 'claim-current')]).toEqual(['SYN-OLD']);
  });
});

it('切换工作根保留原 Claim 仍存在的历史，并只读刷新其实际状态', async () => {
  await temporary(async (dir) => {
    const store = new RegistryStore(join(dir, 'user-data'));
    const previous = await batch(join(dir, 'first/batch'), 'claim-first', 'SYN-FIRST');
    await store.rebuild([previous]);
    const next = await batch(join(dir, 'second/batch'), 'claim-second', 'SYN-SECOND');
    const result = await store.rebuild([next]);
    expect([...submittedNumbers(result, 'claim-second')]).toEqual(['SYN-FIRST']);
    previous.claim!.state = 'returned';
    const raw = JSON.stringify(previous.claim);
    await writeFile(join(previous.dir, CLAIM_FILE), raw);
    const updated = await store.rebuild([next]);
    expect(updated.entries.find((e) => e.claimId === 'claim-first')!.state).toBe('returned');
    expect([...submittedNumbers(updated, 'claim-second')]).toEqual([]);
    expect(await readFile(join(previous.dir, CLAIM_FILE), 'utf8')).toBe(raw);
  });
});

it('当前批次无票据或改为草稿时不保留旧提交记录', async () => {
  await temporary(async (dir) => {
    const store = new RegistryStore(join(dir, 'user-data'));
    const current = await batch(join(dir, 'batch'), 'claim-current', 'SYN-CURRENT');
    await store.rebuild([current]);
    current.claim!.state = 'draft';
    const draft = await store.rebuild([current]);
    expect(draft.entries.map((e) => e.state)).toEqual(['draft']);
    expect([...submittedNumbers(draft, 'other')]).toEqual([]);
    current.invoices = [];
    expect((await store.rebuild([current])).entries).toEqual([]);
  });
});

it.each(['missing', 'different-id', 'invalid'] as const)(
  '历史 Claim 为 %s 时移除缓存条目且不改动历史文件',
  async (kind) => {
    await temporary(async (dir) => {
      const store = new RegistryStore(join(dir, 'user-data'));
      const historical = await batch(join(dir, 'batch'), 'claim-old', 'SYN-OLD');
      await store.rebuild([historical]);
      const file = join(historical.dir, CLAIM_FILE);
      if (kind === 'missing') await rm(historical.dir, { recursive: true });
      else
        await writeFile(
          file,
          kind === 'invalid' ? '{' : JSON.stringify(defaultClaim('different-id', at)),
        );
      expect((await store.rebuild([])).entries).toEqual([]);
      if (kind === 'missing')
        await expect(stat(historical.dir)).rejects.toMatchObject({ code: 'ENOENT' });
      else
        expect(await readFile(file, 'utf8')).toBe(
          kind === 'invalid' ? '{' : JSON.stringify(defaultClaim('different-id', at)),
        );
    });
  },
);

it('并发重建写前读取最新缓存，不丢失其他实例刚保存的 Claim', async () => {
  await temporary(async (dir) => {
    const userData = join(dir, 'user-data');
    const first = await batch(join(dir, 'first'), 'claim-first', 'SYN-FIRST');
    const second = await batch(join(dir, 'second'), 'claim-second', 'SYN-SECOND');
    await Promise.all([
      new RegistryStore(userData).rebuild([first]),
      new RegistryStore(userData).rebuild([second]),
    ]);
    expect((await new RegistryStore(userData).read()).entries.map((e) => e.number)).toEqual([
      'SYN-FIRST',
      'SYN-SECOND',
    ]);
  });
});

it.each(['{', 'null', '{"version":2,"entries":[]}', '{"version":1,"entries":[{}]}'])(
  '坏缓存 %s 可由当前批次安全重建',
  async (raw) => {
    await temporary(async (dir) => {
      const userData = join(dir, 'user-data');
      await mkdir(userData);
      await writeFile(join(userData, 'registry.json'), raw);
      const store = new RegistryStore(userData);
      expect(await store.read()).toEqual({ version: 1, entries: [] });
      const current = await batch(join(dir, 'batch'), 'claim-current', 'SYN-CURRENT');
      expect((await store.rebuild([current])).entries.map((e) => e.number)).toEqual([
        'SYN-CURRENT',
      ]);
    });
  },
);

it('缓存文件和 userData 祖先为符号链接时拒绝读写外部文件', async () => {
  await temporary(async (dir) => {
    const outside = join(dir, 'outside');
    const userData = join(dir, 'user-data');
    await mkdir(outside);
    await mkdir(userData);
    const raw = '{"version":1,"entries":[]}';
    await writeFile(join(outside, 'registry.json'), raw);
    await symlink(join(outside, 'registry.json'), join(userData, 'registry.json'));
    const fileStore = new RegistryStore(userData);
    await expect(fileStore.read()).rejects.toThrow('符号链接');
    await expect(fileStore.rebuild([])).rejects.toThrow('符号链接');
    await symlink(outside, join(dir, 'linked'), 'junction');
    const ancestorStore = new RegistryStore(join(dir, 'linked/child'));
    await expect(ancestorStore.read()).rejects.toThrow('符号链接');
    await expect(ancestorStore.rebuild([])).rejects.toThrow('符号链接');
    await expect(stat(join(outside, 'child'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(outside, 'registry.json'), 'utf8')).toBe(raw);
  });
});

it('历史 Claim 文件或祖先变为符号链接时丢弃记录', async () => {
  await temporary(async (dir) => {
    const store = new RegistryStore(join(dir, 'user-data'));
    const historical = await batch(join(dir, 'batch'), 'claim-old', 'SYN-OLD');
    await store.rebuild([historical]);
    const raw = await readFile(join(historical.dir, CLAIM_FILE), 'utf8');
    const outside = join(dir, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'claim.json'), raw);
    await rm(join(historical.dir, '_预检'), { recursive: true });
    await symlink(outside, join(historical.dir, '_预检'), 'junction');
    expect((await store.rebuild([])).entries).toEqual([]);
    expect(await readFile(join(outside, 'claim.json'), 'utf8')).toBe(raw);
  });
});
