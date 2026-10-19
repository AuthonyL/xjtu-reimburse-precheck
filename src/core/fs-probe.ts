import { readdir } from 'node:fs/promises';

export function isProbeError(error: unknown): boolean {
  return ['EACCES', 'EPERM', 'EBUSY', 'ENOENT'].includes(
    (error as NodeJS.ErrnoException)?.code ?? '',
  );
}

// null distinguishes an inaccessible directory from an empty, readable one.
export async function probeDirectory(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isProbeError(error)) return null;
    throw error;
  }
}

export async function probe<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (isProbeError(error)) return null;
    throw error;
  }
}

export async function readSelectedDirectory(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (!isProbeError(error)) throw error;
    throw selectedDirectoryError(dir, error);
  }
}

export function selectedDirectoryError(dir: string, cause: unknown) {
  const code = (cause as NodeJS.ErrnoException).code;
  const reason = code === 'ENOENT' ? '目录已不存在' : '请检查访问权限或关闭占用该目录的程序';
  return Object.assign(new Error(`无法读取所选文件夹：${dir}。${reason}（${code}）`, { cause }), {
    code,
  });
}
