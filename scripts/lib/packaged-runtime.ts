import { extractAll, listPackage } from '@electron/asar';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type PackagedCore = typeof import('../../src/core/index.js');

export function packageResources(directory: string): string {
  return join(resolve(directory), directory.endsWith('.app') ? 'Contents/Resources' : 'resources');
}

export function packageFiles(directory: string): string[] {
  return listPackage(join(packageResources(directory), 'app.asar'), { isPack: false }).map((f) =>
    f.replaceAll('\\', '/').replace(/^\//, ''),
  );
}

export async function withPackagedCore<T>(
  directory: string,
  run: (core: PackagedCore, extracted: string) => Promise<T>,
): Promise<T> {
  const extracted = await mkdtemp(join(tmpdir(), 'precheck-packaged-runtime-'));
  try {
    extractAll(join(packageResources(directory), 'app.asar'), extracted);
    const core = (await import(
      pathToFileURL(join(extracted, 'out/main/core.js')).href
    )) as PackagedCore;
    return await run(core, extracted);
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
}
