import { readFile, readdir } from 'node:fs/promises';
import { isUtf8 } from 'node:buffer';
import { join, posix } from 'node:path';

interface IgnoreRule {
  negative: boolean;
  directory: boolean;
  pattern: RegExp;
}
function ignoreRules(text: string): IgnoreRule[] {
  return text.split(/\r?\n/).flatMap((raw) => {
    let value = raw.trim();
    if (!value || value.startsWith('#')) return [];
    const negative = value.startsWith('!');
    if (negative) value = value.slice(1);
    const directory = value.endsWith('/');
    if (directory) value = value.slice(0, -1);
    const anchored = value.startsWith('/');
    if (anchored) value = value.slice(1);
    const prefix = anchored || value.includes('/') ? '^' : '(?:^|/)';
    let glob = '';
    for (let i = 0; i < value.length; i++) {
      const char = value[i]!;
      if (char === '*' && value[i + 1] === '*') {
        i++;
        if (value[i + 1] === '/') {
          glob += '(?:.*/)?';
          i++;
        } else glob += '.*';
      } else if (char === '*') glob += '[^/]*';
      else if (char === '?') glob += '[^/]';
      else glob += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return [{ negative, directory, pattern: new RegExp(prefix + glob + '$') }];
  });
}

/** 公共清单直接按忽略文件计算，不读取版本控制状态，不跟随符号链接。 */
export async function publicFiles(root: string): Promise<string[]> {
  const rules = ignoreRules(await readFile(join(root, '.gitignore'), 'utf8').catch(() => ''));
  const files: string[] = [];
  const visit = async (relative: string) => {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const file = posix.join(relative, entry.name);
      if (entry.name === '.git' || entry.isSymbolicLink()) continue;
      let ignored = false;
      for (const rule of rules)
        if ((!rule.directory || entry.isDirectory()) && rule.pattern.test(file))
          ignored = !rule.negative;
      if (ignored) continue;
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  await visit('');
  return files.sort();
}

// Only generic patterns live here; maintainer-specific strings stay in the ignored private/ folder.
const prohibited: [string, RegExp][] = [
  ['local home path', /\/Users\/|[A-Z]:\\Users\\/],
  ['chat identifier', /wxid[_]/i],
  ['personal email', /[\w.%+-]+@(gmail|qq|163|126|foxmail|outlook|hotmail)[.]com/i],
  ['long numeric identifier', /\d{20}/],
];
/** Optional private/forbidden-patterns.json: [{ "name": "...", "pattern": "<regex source>" }]. */
async function privatePatterns(root: string): Promise<[string, RegExp][]> {
  const raw = await readFile(join(root, 'private', 'forbidden-patterns.json'), 'utf8').catch(
    () => null,
  );
  if (raw === null) return [];
  const list = JSON.parse(raw) as { name: string; pattern: string }[];
  return list.map(({ name, pattern }) => [name, new RegExp(pattern, 'i')]);
}
export interface ContentViolation {
  file: string;
  line: number;
  pattern: string;
}
export async function scanPublicContent(root: string): Promise<ContentViolation[]> {
  const violations: ContentViolation[] = [];
  const patterns = [...prohibited, ...(await privatePatterns(root))];
  for (const file of await publicFiles(root)) {
    if (/\.(png|ico|icns|jpg|jpeg|gif|webp|pdf|woff2?|ttf|zip|exe|dmg)$/i.test(file)) continue;
    const bytes = await readFile(join(root, file));
    if (bytes.includes(0) || !isUtf8(bytes)) continue;
    for (const [index, line] of bytes.toString('utf8').split(/\r?\n/).entries())
      for (const [name, pattern] of patterns)
        if (pattern.test(line)) violations.push({ file, line: index + 1, pattern: name });
  }
  return violations;
}
