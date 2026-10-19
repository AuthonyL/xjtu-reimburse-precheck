import { build, Platform, Arch } from 'electron-builder';
import { join, resolve } from 'node:path';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPackageConfig, prepareBuilderCache } from './lib/packaging.js';
import { generateIcon } from './generate-icon.js';
import { createDmgWithoutMount, isDmgDeviceError } from './lib/dmg.js';

process.env.ELECTRON_BUILDER_CACHE = resolve('.builder-cache');
process.env.electron_config_cache = resolve('.electron-cache');
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
await prepareBuilderCache();
const mode = process.argv[2] ?? 'all';
if (!['mac', 'win', 'all'].includes(mode)) throw new Error('目标只能为 mac、win 或 all');
if (mode !== 'win' && process.platform !== 'darwin')
  throw new Error('Mac DMG 只能在 macOS 上构建；当前平台请使用 npm run dist:win');
console.log(
  JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, mode }),
);
await generateIcon();
const results: {
  target: string;
  durationMs: number;
  files?: string[];
  error?: string;
  dmgMethod?: string;
}[] = [];
const targets = [
  { platform: 'darwin' as const, arch: 'arm64' as const, mode: 'mac' },
  { platform: 'darwin' as const, arch: 'x64' as const, mode: 'mac' },
  { platform: 'win32' as const, arch: 'x64' as const, mode: 'win' },
].filter((t) => mode === 'all' || t.mode === mode);
for (const target of targets) {
  const name = `${target.platform}-${target.arch}`;
  const started = performance.now();
  try {
    const config = createPackageConfig(target.platform, target.arch);
    const platform = target.platform === 'darwin' ? Platform.MAC : Platform.WINDOWS;
    let files: string[];
    let dmgMethod: string | undefined;
    try {
      files = await build({
        targets: platform.createTarget(undefined, target.arch === 'arm64' ? Arch.arm64 : Arch.x64),
        config,
        publish: 'never',
      });
    } catch (error) {
      if (target.platform !== 'darwin' || !isDmgDeviceError(error)) throw error;
      const application = resolve(
        'release',
        target.arch === 'arm64' ? 'mac-arm64' : 'mac',
        '报销预检.app',
      );
      await promisify(execFile)('codesign', ['--verify', '--deep', '--strict', application]);
      console.log(
        `${name}：磁盘镜像设备不可用，改用无挂载 HFS+ / UDBZ 生成（保留已签名应用与 Applications 链接）`,
      );
      const version = (
        JSON.parse(await readFile('package.json', 'utf8')) as {
          version: string;
        }
      ).version;
      files = [
        await createDmgWithoutMount(
          application,
          join('release', `ReimbursePrecheck-${version}-mac-${target.arch}.dmg`),
          `报销预检 ${version}`,
        ),
      ];
      dmgMethod = 'hfs-without-mount';
    }
    results.push({
      target: name,
      durationMs: Math.round(performance.now() - started),
      files,
      dmgMethod,
    });
    console.log(`PASS 打包 ${name}：${files.join('、')}`);
  } catch (error) {
    results.push({
      target: name,
      durationMs: Math.round(performance.now() - started),
      error: String(error),
    });
    console.error(`FAIL 打包 ${name}：${String(error)}`);
  }
}
await mkdir('release', { recursive: true });
await writeFile('release/build-results.json', JSON.stringify(results, null, 2) + '\n');
if (results.some((r) => r.error)) {
  process.exitCode = 1;
  process.on('exit', () => {
    process.exitCode = 1;
  });
}
