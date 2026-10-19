import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createDmgWithoutMount, isDmgDeviceError } from '../scripts/lib/dmg.js';

it('仅对明确的DMG设备限制启用无挂载兜底', () => {
  expect(isDmgDeviceError(new Error('hdiutil: create failed - Device not configured'))).toBe(true);
  expect(isDmgDeviceError(new Error('codesign failed'))).toBe(false);
  expect(isDmgDeviceError(new Error('hdiutil: create failed - No space left on device'))).toBe(
    false,
  );
});

it.skipIf(process.platform !== 'darwin')('无挂载兜底生成含校验和的UDBZ镜像', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precheck-dmg-test-'));
  try {
    const app = join(dir, '合成.app');
    await mkdir(app);
    await writeFile(join(app, 'synthetic.txt'), '合成数据');
    const output = await createDmgWithoutMount(app, join(dir, 'synthetic.dmg'), '合成验证');
    const { stdout, stderr } = await promisify(execFile)('hdiutil', ['verify', output]);
    expect(stdout + stderr).toContain('VALID');
    expect(output).toBe(join(dir, 'synthetic.dmg'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
