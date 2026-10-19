import { setTimeout } from 'node:timers/promises';
import { rm } from 'node:fs/promises';

export async function retryFileOperation<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code ?? '';
      if (['EBUSY', 'EPERM'].includes(code) && attempt < 2) {
        await setTimeout(60 * (attempt + 1));
        continue;
      }
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(code)) throw cause;
      throw Object.assign(
        new Error(
          `${label}失败：文件被占用或没有访问权限，请关闭占用程序并检查权限后重试（${code}）`,
          { cause },
        ),
        { code },
      );
    }
  }
}

export function removePath(file: string, recursive = false) {
  return retryFileOperation('删除文件', () => rm(file, { recursive, force: true }));
}
