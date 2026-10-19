import path, { posix } from 'node:path';
import { pathWithin } from '../fs-path.js';
export function safeRelative(value: string, allowRoot = false): string {
  if (allowRoot && value === '') return '';
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').some((p) => !p || p === '..' || p === '.') ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error('路径必须为目录内规范相对路径');
  return value;
}
export const safeFileName = (name: string): string =>
  name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+|[. ]+$/g, '')
    .slice(0, 100) || '未命名';
export function replacementDestination(sources: string[], incoming: string, existing: string[]) {
  if (!sources.length) throw new Error('没有可替换的原文件');
  sources.forEach((s) => safeRelative(s));
  const extension = posix.extname(incoming).toLowerCase();
  if (!/^\.[a-z0-9]{1,10}$/.test(extension)) throw new Error('新文件扩展名不合法');
  const replaced = sources.find((s) => posix.extname(s).toLowerCase() === extension) ?? sources[0]!;
  const destination =
    posix.extname(replaced).toLowerCase() === extension
      ? replaced
      : replaced.slice(0, -posix.extname(replaced).length) + extension;
  if (existing.some((f) => f.toLowerCase() === destination.toLowerCase() && f !== replaced))
    throw new Error('目标文件已存在，请选择该文件对应的问题或先核对重名文件');
  return { destination: safeRelative(destination), replaced };
}
export function attachmentDestination(
  folder: string,
  label: string,
  object: string,
  extension: string,
  existing: string[],
): string {
  return newFileDestination(
    folder,
    safeFileName(label) + '-' + safeFileName(object) + extension,
    existing,
  );
}
export function newFileDestination(folder: string, incoming: string, existing: string[]): string {
  safeRelative(folder, true);
  const extension = posix.extname(incoming);
  if (!/^\.[a-z0-9]{1,10}$/i.test(extension)) throw new Error('附件扩展名不合法');
  const name = safeFileName(posix.basename(incoming, extension));
  let n = 1;
  let file: string;
  do {
    file = posix.join(folder, name + (n === 1 ? '' : `(${n})`) + extension.toLowerCase());
    n++;
  } while (existing.some((f) => f.toLowerCase() === file.toLowerCase()));
  return safeRelative(file);
}

export function existingRelativePath(
  base: string,
  file: string,
  api: path.PlatformPath = path,
  realpath?: (file: string) => string,
): string | null {
  return pathWithin(base, file, { api, realpath }) || null;
}
export function sameRelativeFile(
  a: string,
  b: string,
  ignoreCase = process.platform === 'win32',
): boolean {
  return ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;
}
