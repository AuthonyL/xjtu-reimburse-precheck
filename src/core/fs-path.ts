import { realpathSync } from 'node:fs';
import path from 'node:path';

export interface PathOptions {
  api?: path.PlatformPath;
  realpath?: (file: string) => string;
}

// Synchronous callers (rules and placement) use the native realpath variant too.
// A foreign path flavor is lexical unless a resolver is injected by a test.
export function canonicalPath(input: string, options: PathOptions = {}): string {
  const api = options.api ?? path;
  const native =
    options.realpath ?? (api.sep === path.sep ? realpathSync.native : (file: string) => file);
  const resolve = (file: string): string => {
    try {
      return native(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = api.dirname(file);
      // A disconnected drive can still occur in recent folders or submission history.
      if (parent === file) return file;
      return api.join(resolve(parent), api.basename(file));
    }
  };
  return api.normalize(resolve(api.resolve(input)));
}

export function pathKey(input: string, options: PathOptions = {}): string {
  const api = options.api ?? path;
  const value = canonicalPath(input, options).split(api.sep).join('/');
  return api.sep === '\\' ? value.toLowerCase() : value;
}

export function samePath(
  a: string | null | undefined,
  b: string | null | undefined,
  options: PathOptions = {},
): boolean {
  if (a == null || b == null) return a === b;
  return pathKey(a, options) === pathKey(b, options);
}

export function relativePath(base: string, file: string, options: PathOptions = {}): string {
  const api = options.api ?? path;
  return api
    .relative(canonicalPath(base, options), canonicalPath(file, options))
    .split(api.sep)
    .join('/');
}

export function pathWithin(base: string, file: string, options: PathOptions = {}): string | null {
  const api = options.api ?? path;
  const relative = relativePath(base, file, options);
  if (api.isAbsolute(relative) || relative === '..' || relative.startsWith('../')) return null;
  return relative;
}
