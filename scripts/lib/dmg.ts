import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, rename, rm, symlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const execute = promisify(execFile);

export function isDmgDeviceError(error: unknown): boolean {
  return String(error).includes('hdiutil: create failed - Device not configured');
}

export async function createDmgWithoutMount(
  application: string,
  artifact: string,
  volumeName: string,
  compression: 'normal' | 'maximum' = 'maximum',
): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('DMG 生成需要 macOS 的 hdiutil');
  const temporary = await mkdtemp(join(tmpdir(), 'precheck-dmg-'));
  try {
    const staging = join(temporary, 'contents');
    await mkdir(staging);
    await cp(application, join(staging, basename(application)), {
      recursive: true,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    });
    await symlink('/Applications', join(staging, 'Applications'));
    // HFS+ 文件系统与压缩镜像都在用户态生成，不申请挂载设备。
    const hybrid = join(temporary, 'filesystem.dmg');
    await execute('hdiutil', [
      'makehybrid',
      '-hfs',
      '-hfs-volume-name',
      volumeName,
      '-hfs-openfolder',
      staging,
      '-o',
      hybrid,
      staging,
    ]);
    const image = join(temporary, 'installer.dmg');
    await execute(
      'hdiutil',
      ['convert', hybrid, '-format', compression === 'maximum' ? 'UDBZ' : 'UDZO', '-o', image],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    await execute('hdiutil', ['verify', image]);
    const destination = resolve(artifact);
    await mkdir(dirname(destination), { recursive: true });
    await rename(image, destination);
    await rm(destination + '.blockmap', { force: true });
    return destination;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
