import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NtExecutable, NtExecutableResource, Format } from 'pe-library';
import { Data, Resource } from 'resedit';
import { PNG } from 'pngjs';
import { WINDOWS_ICON_SIZES } from './windows-ico.js';

interface WindowsPackContext {
  electronPlatformName: string;
  appOutDir: string;
  packager: {
    buildResourcesDir: string;
    appInfo: { productFilename: string; version: string };
  };
}

function numericVersion(version: string): [number, number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error('Windows资源版本必须以 major.minor.patch 开头');
  const parts = match.slice(1, 5).map((s) => Number(s ?? 0));
  if (parts.some((n) => n > 65535)) throw new Error('Windows资源版本各段不能超过65535');
  return parts as [number, number, number, number];
}

export function rewriteWindowsResources(binary: Uint8Array, ico: Buffer, version: string): Buffer {
  const parts = numericVersion(version);
  const exe = NtExecutable.from(binary, { ignoreCert: true });
  const resource = NtExecutableResource.from(exe);
  const groups = Resource.IconGroupEntry.fromEntries(resource.entries);
  if (!groups.length) throw new Error('exe未找到原有图标组，拒绝仅添加新图标');
  const icons = Data.IconFile.from(ico).icons.map((i) => i.data);
  for (const group of groups)
    Resource.IconGroupEntry.replaceIconsForResource(resource.entries, group.id, group.lang, icons);
  const versions = Resource.VersionInfo.fromEntries(resource.entries);
  if (!versions.length) versions.push(Resource.VersionInfo.createEmpty());
  for (const info of versions) {
    const language = typeof info.lang === 'number' ? info.lang : 1033;
    info.setFileVersion(...parts, language);
    info.setProductVersion(...parts, language);
    for (const locale of info.getAllLanguagesForStringValues())
      info.setStringValues(locale, {
        ProductName: '报销预检',
        FileDescription: '报销预检',
        FileVersion: version,
        ProductVersion: version,
        OriginalFilename: '报销预检.exe',
      });
    info.outputToResourceEntries(resource.entries);
  }
  resource.outputResource(exe);
  exe.newHeader.optionalHeaderDataDirectory.set(Format.ImageDirectoryEntry.Certificate, {
    virtualAddress: 0,
    size: 0,
  });
  return Buffer.from(exe.generate());
}

export function verifyWindowsResources(binary: Uint8Array, ico: Buffer, version: string) {
  const exe = NtExecutable.from(binary, { ignoreCert: true });
  const resource = NtExecutableResource.from(exe);
  const source = Data.IconFile.from(ico);
  const sizes = source.icons.map((i) => i.width || 256).sort((a, b) => a - b);
  assert.deepEqual(sizes, WINDOWS_ICON_SIZES, 'ICO缺少要求尺寸');
  const largest = source.icons.find((i) => (i.width || 256) === 256)!.data;
  assert(largest.isRaw(), '256尺寸ICO必须为PNG');
  const expectedPixels = PNG.sync.read(Buffer.from(largest.bin)).data;
  const pixelHash = createHash('sha256').update(expectedPixels).digest('hex');
  const groups = Resource.IconGroupEntry.fromEntries(resource.entries);
  assert(groups.length > 0, 'exe缺少主图标组');
  const iconGroups = groups.map((group) => {
    assert(
      group.icons.every((i) => (i.width || 256) === (i.height || 256)),
      'exe图标不是正方形',
    );
    const actualSizes = group.icons.map((i) => i.width || 256).sort((a, b) => a - b);
    assert.deepEqual(actualSizes, sizes, 'exe图标尺寸与ICO不一致');
    const iconId = group.icons.find((i) => (i.width || 256) === 256)!.iconID;
    const entry = resource.entries.find(
      (e) => e.type === 3 && e.id === iconId && e.lang === group.lang,
    );
    assert(entry, 'exe缺少256尺寸图像');
    const image = PNG.sync.read(Buffer.from(entry.bin));
    assert.equal(image.width, 256);
    assert.equal(image.height, 256);
    const actualHash = createHash('sha256').update(image.data).digest('hex');
    assert.equal(actualHash, pixelHash, 'exe最大尺寸图像像素与ICO不一致');
    return { id: group.id, lang: group.lang, sizes: actualSizes, largestPixelSha256: actualHash };
  });
  const [major, minor, patch, revision] = numericVersion(version);
  const info = Resource.VersionInfo.fromEntries(resource.entries);
  assert(info.length > 0, 'exe缺少版本信息');
  const versions = info.flatMap((item) => {
    for (const key of ['fileVersionMS', 'productVersionMS'] as const)
      assert.equal(item.fixedInfo[key] >>> 0, ((major << 16) | minor) >>> 0);
    for (const key of ['fileVersionLS', 'productVersionLS'] as const)
      assert.equal(item.fixedInfo[key] >>> 0, ((patch << 16) | revision) >>> 0);
    const locales = item.getAllLanguagesForStringValues();
    assert(locales.length > 0, 'exe缺少本地化版本字符串');
    return locales.map((locale) => {
      const strings = item.getStringValues(locale);
      assert.equal(strings.ProductName, '报销预检');
      assert.equal(strings.FileDescription, '报销预检');
      assert.equal(strings.ProductVersion, version);
      assert.equal(strings.FileVersion, version);
      assert.equal(strings.OriginalFilename, '报销预检.exe');
      return { ...locale, ...strings };
    });
  });
  const certificateSize = exe.newHeader.optionalHeaderDataDirectory.get(
    Format.ImageDirectoryEntry.Certificate,
  ).size;
  assert.equal(certificateSize, 0, '资源改写后不能保留失效证书目录');
  const integrity = resource.entries.find((e) => e.type === 'INTEGRITY' && e.id === 'ELECTRONASAR');
  return {
    iconGroups,
    versions,
    certificateSize,
    integrity: integrity ? Buffer.from(integrity.bin).toString('utf8') : null,
  };
}

export async function afterPackWindows(context: WindowsPackContext): Promise<void> {
  if (context.electronPlatformName !== 'win32') return;
  const executable = join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  const icon = await readFile(join(context.packager.buildResourcesDir, 'icon.ico'));
  const original = await readFile(executable);
  const version = context.packager.appInfo.version;
  const updated = rewriteWindowsResources(original, icon, version);
  const summary = verifyWindowsResources(updated, icon, version);
  const temporary = executable + `.resources-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, updated, { flag: 'wx', mode: (await stat(executable)).mode });
    await rename(temporary, executable);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(
    `PASS Windows资源：替换原图标组 ${summary.iconGroups.map((g) => g.id).join('/')}；ProductName=报销预检；FileVersion=${version}；未调用wine/rcedit`,
  );
}
