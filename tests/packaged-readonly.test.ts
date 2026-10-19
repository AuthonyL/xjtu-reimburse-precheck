import { expect, it } from 'vitest';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { baselineOutputPath } from '../scripts/lib/read-only-tree.js';

it('基线拒绝真实源树及其符号链接别名，不只比较字符串路径', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-baseline-path-'));
  try {
    const root = join(dir, 'source');
    await mkdir(root);
    await symlink(root, join(dir, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(baselineOutputPath(root, join(root, 'baseline.json'))).rejects.toThrow('源目录');
    await expect(baselineOutputPath(root, join(dir, 'alias/baseline.json'))).rejects.toThrow(
      '源目录',
    );
    const out = await baselineOutputPath(root, join(dir, 'baseline.json'));
    expect(out.endsWith('baseline.json')).toBe(true);
    await expect(baselineOutputPath(root, resolve('baseline.json'))).rejects.toThrow(
      '系统临时目录',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
