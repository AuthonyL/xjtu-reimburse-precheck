import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export function bundledPackageRoot(id: string): string | null {
  const file = id.split('?')[0]!.replace(/^\0/, '').replaceAll('\\', '/');
  const marker = '/node_modules/';
  const at = file.lastIndexOf(marker);
  if (at < 0) return null;
  const parts = file.slice(at + marker.length).split('/');
  const name = parts[0]!.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1);
  return file.slice(0, at) + marker + name.join('/');
}

export async function bundleNotices(moduleIds: string[]): Promise<string> {
  const roots = new Set(moduleIds.map(bundledPackageRoot).filter((root) => root !== null));
  const notices: string[] = [];
  for (const root of [...roots].sort()) {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
      license?: string;
    };
    const files = (await readdir(root))
      .filter((f) => /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i.test(f))
      .sort();
    const texts = await Promise.all(
      files.map(async (file) => `${file}\n${await readFile(join(root, file), 'utf8')}`),
    );
    notices.push(
      `${pkg.name}@${pkg.version} (${pkg.license ?? '见原包许可'})\n${texts.join('\n\n')}`,
    );
  }
  return (
    'Third-party notices for bundled JavaScript\n\n' +
    notices.join('\n\n' + '='.repeat(72) + '\n\n') +
    '\n'
  );
}

export function bundleNoticesPlugin(): Plugin {
  return {
    name: 'bundled-third-party-notices',
    async generateBundle(_options, bundle) {
      const modules = Object.values(bundle).flatMap((entry) =>
        entry.type === 'chunk' ? Object.keys(entry.modules) : [],
      );
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-notices.txt',
        source: await bundleNotices(modules),
      });
    },
  };
}
