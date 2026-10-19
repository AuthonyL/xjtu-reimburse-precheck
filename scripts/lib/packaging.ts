import type { Configuration } from 'electron-builder';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { afterPackWindows } from './windows-resources.js';

export async function prepareBuilderCache(directory = resolve('.builder-cache')) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');
}

export function createPackageConfig(
  _platform: 'darwin' | 'win32',
  _arch: 'arm64' | 'x64',
): Configuration {
  return {
    appId: 'cn.edu.research.reimburse-precheck',
    productName: '报销预检',
    directories: { output: 'release', buildResources: 'build' },
    electronLanguages: ['zh-CN', 'en-US'],
    compression: 'maximum',
    afterPack: afterPackWindows,
    files: [
      'out/**/*',
      'package.json',
      {
        from: resolve('node_modules/pdfjs-dist'),
        to: 'node_modules/pdfjs-dist',
        filter: [
          'package.json',
          'LICENSE',
          'legacy/build/pdf.mjs',
          'legacy/build/pdf.worker.mjs',
          'cmaps/**/*',
          'standard_fonts/**/*',
          'wasm/**/*',
        ],
      },
    ],
    asar: true,
    asarUnpack: ['node_modules/pdfjs-dist/**/*'],
    npmRebuild: false,
    buildDependenciesFromSource: false,
    electronDownload: { cache: resolve('.electron-cache') },
    publish: null,
    mac: {
      electronLanguages: ['zh_CN', 'en_US'],
      target: 'dmg',
      identity: '-',
      notarize: false,
      hardenedRuntime: true,
      category: 'public.app-category.productivity',
      icon: 'build/icon.png',
      artifactName: 'ReimbursePrecheck-${version}-mac-${arch}.${ext}',
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.plist',
    },
    dmg: { sign: false, title: '报销预检 ${version}' },
    win: { target: 'nsis', icon: 'build/icon.ico', signAndEditExecutable: false },
    nsis: {
      artifactName: 'ReimbursePrecheck-${version}-win-${arch}-setup.${ext}',
      installerIcon: 'build/icon.ico',
      uninstallerIcon: 'build/icon.ico',
      installerHeaderIcon: 'build/icon.ico',
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: '报销预检',
      runAfterFinish: false,
      deleteAppDataOnUninstall: false,
      installerLanguages: ['zh_CN', 'en_US'],
      displayLanguageSelector: false,
    },
  };
}
