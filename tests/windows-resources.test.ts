import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { NtExecutable, NtExecutableResource, Format } from 'pe-library';
import { Data, Resource } from 'resedit';
import { createWindowsIco } from '../scripts/lib/windows-ico.js';
import {
  afterPackWindows,
  rewriteWindowsResources,
  verifyWindowsResources,
} from '../scripts/lib/windows-resources.js';
import { createPackageConfig } from '../scripts/lib/packaging.js';

function ico() {
  const image = new PNG({ width: 256, height: 256 });
  image.data.fill(180);
  return createWindowsIco(PNG.sync.write(image));
}
function executable() {
  const exe = NtExecutable.createEmpty(false, false);
  const resources = NtExecutableResource.from(exe);
  const image = new Data.IconFile();
  const png = new PNG({ width: 16, height: 16 });
  png.data.fill(90);
  image.icons = [{ data: Data.RawIconItem.from(PNG.sync.write(png), 16, 16, 32) }];
  for (const lang of [1033, 2052]) {
    Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      77,
      lang,
      image.icons.map((i) => i.data),
    );
    Resource.VersionInfo.create({
      lang,
      fixedInfo: {},
      strings: [
        {
          lang,
          codepage: 1200,
          values: { ProductName: 'SYNTH DEFAULT', CompanyName: 'SYNTH COMPANY' },
        },
      ],
    }).outputToResourceEntries(resources.entries);
  }
  resources.entries.push({
    type: 'INTEGRITY',
    id: 'ELECTRONASAR',
    lang: 1033,
    codepage: 1200,
    bin: new TextEncoder().encode('SYNTH ASAR INTEGRITY').buffer,
  });
  resources.outputResource(exe);
  exe.setExtraData(Buffer.from('SYNTH OVERLAY'));
  return Buffer.from(exe.generate());
}

it('替换原图标ID而非新增，全部版本语言写入中文名称及包版本，保留完整性资源与overlay', () => {
  const original = executable();
  const icon = ico();
  const updated = rewriteWindowsResources(original, icon, '1.2.3');
  const summary = verifyWindowsResources(updated, icon, '1.2.3');
  expect(summary.iconGroups.map((g) => [g.id, g.lang])).toEqual([
    [77, 1033],
    [77, 2052],
  ]);
  expect(summary.versions).toHaveLength(2);
  for (const version of summary.versions) {
    expect(version).toMatchObject({
      ProductName: '报销预检',
      FileDescription: '报销预检',
      FileVersion: '1.2.3',
      ProductVersion: '1.2.3',
      OriginalFilename: '报销预检.exe',
    });
  }
  const exe = NtExecutable.from(updated);
  expect(Buffer.from(exe.getExtraData()!)).toEqual(Buffer.from('SYNTH OVERLAY'));
  expect(
    exe.newHeader.optionalHeaderDataDirectory.get(Format.ImageDirectoryEntry.Certificate).size,
  ).toBe(0);
  const resources = NtExecutableResource.from(exe);
  expect(Buffer.from(resources.entries.find((e) => e.type === 'INTEGRITY')!.bin).toString()).toBe(
    'SYNTH ASAR INTEGRITY',
  );
  expect(
    Resource.VersionInfo.fromEntries(resources.entries)[0]!.getStringValues({
      lang: 1033,
      codepage: 1200,
    }).CompanyName,
  ).toBe('SYNTH COMPANY');
});

it('afterPack 对非win32目标直接返回，不读取Mac源图或应用文件', async () => {
  await expect(
    afterPackWindows({
      electronPlatformName: 'darwin',
      appOutDir: '/does-not-exist',
      get packager(): never {
        throw new Error('不应访问packager');
      },
    }),
  ).resolves.toBeUndefined();
});

it('接受含证书目录的输入，输出清除失效签名而保留overlay', () => {
  const unsigned = executable();
  const certificateAt = Math.ceil(unsigned.length / 8) * 8;
  const signed = Buffer.alloc(certificateAt + 16);
  unsigned.copy(signed);
  const dos = Format.ImageDosHeader.from(signed);
  const header = Format.ImageNtHeaders.from(signed, dos.newHeaderAddress);
  header.optionalHeaderDataDirectory.set(Format.ImageDirectoryEntry.Certificate, {
    virtualAddress: certificateAt,
    size: 16,
  });
  signed.writeUInt32LE(16, certificateAt);
  signed.writeUInt16LE(0x200, certificateAt + 4);
  signed.writeUInt16LE(2, certificateAt + 6);
  const icon = ico();
  const updated = rewriteWindowsResources(signed, icon, '1.2.3');
  expect(verifyWindowsResources(updated, icon, '1.2.3').certificateSize).toBe(0);
  expect(Buffer.from(NtExecutable.from(updated).getExtraData()!).toString()).toContain(
    'SYNTH OVERLAY',
  );
});

it('afterPack 在win32目录实际改写exe，NSIS三项图标同源且不启用rcedit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'precheck-resources-'));
  try {
    const buildResourcesDir = join(root, 'build');
    const appOutDir = join(root, 'win-unpacked');
    await mkdir(buildResourcesDir);
    await mkdir(appOutDir);
    const icon = ico();
    await writeFile(join(buildResourcesDir, 'icon.ico'), icon);
    await writeFile(join(appOutDir, '报销预检.exe'), executable());
    await afterPackWindows({
      electronPlatformName: 'win32',
      appOutDir,
      packager: { buildResourcesDir, appInfo: { productFilename: '报销预检', version: '1.2.3' } },
    });
    expect(
      verifyWindowsResources(await readFile(join(appOutDir, '报销预检.exe')), icon, '1.2.3')
        .iconGroups,
    ).toHaveLength(2);
    const config = createPackageConfig('win32', 'x64');
    expect(config.afterPack).toBe(afterPackWindows);
    expect(config.win?.signAndEditExecutable).toBe(false);
    expect(config.win?.icon).toBe('build/icon.ico');
    expect(config.nsis).toMatchObject({
      installerIcon: 'build/icon.ico',
      uninstallerIcon: 'build/icon.ico',
      installerHeaderIcon: 'build/icon.ico',
    });
    expect(createPackageConfig('darwin', 'arm64').mac?.icon).toBe('build/icon.png');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
