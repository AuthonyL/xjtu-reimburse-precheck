import { expect, it } from 'vitest';
import path from 'node:path';
import { existingRelativePath } from '../src/core/correction/placement.js';
import { canonicalPath, pathKey, relativePath, samePath, pathWithin } from '../src/core/fs-path.js';

const options = {
  api: path.win32,
  realpath: (file: string) => {
    if (/新目录|new\.pdf/i.test(file))
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return file.replace(/RUNNER~1/i, 'runneradmin');
  },
};
it('Windows 短路径、长路径、大小写与分隔符识别为同一目录', () => {
  expect(samePath('C:\\Users\\RUNNER~1\\Temp', 'c:/users/runneradmin/TEMP', options)).toBe(true);
  expect(pathKey('C:\\Users\\RUNNER~1\\Temp', options)).toBe('c:/users/runneradmin/temp');
  expect(
    relativePath('C:\\Users\\RUNNER~1\\Temp', 'c:/users/runneradmin/TEMP/AI/a.png', options),
  ).toBe('AI/a.png');
  expect(
    pathWithin('C:\\Users\\RUNNER~1\\Temp', 'c:/users/runneradmin/TEMP/AI/a.png', options),
  ).toBe('AI/a.png');
  expect(
    existingRelativePath(
      'C:\\Users\\RUNNER~1\\Temp',
      'c:/users/runneradmin/TEMP/AI/a.png',
      path.win32,
      options.realpath,
    ),
  ).toBe('AI/a.png');
});
it('未创建文件和多层目录从最近存在父目录取得原生路径', () => {
  expect(canonicalPath('C:\\Users\\RUNNER~1\\Temp\\新目录\\new.pdf', options)).toBe(
    'C:\\Users\\runneradmin\\Temp\\新目录\\new.pdf',
  );
  expect(
    pathWithin('C:\\Users\\RUNNER~1\\Temp', 'c:/users/runneradmin/TEMP/新目录/new.pdf', options),
  ).toBe('新目录/new.pdf');
});
it('跨盘符、同名前缀和上层不算目录内，同目录返回空相对路径', () => {
  expect(pathWithin('C:\\Temp', 'D:\\Temp\\a.pdf', options)).toBeNull();
  expect(pathWithin('C:\\Temp', 'C:\\Temp2\\a.pdf', options)).toBeNull();
  expect(pathWithin('C:\\Temp', 'C:\\a.pdf', options)).toBeNull();
  expect(pathWithin('C:\\Temp', 'c:/temp', options)).toBe('');
});
it('POSIX 保留大小写，原生路径错误只对 ENOENT 回退', () => {
  expect(samePath('/Batch', '/batch', { api: path.posix, realpath: (p) => p })).toBe(false);
  expect(() =>
    canonicalPath('/blocked', {
      realpath: () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
    }),
  ).toThrow('denied');
});
it('历史中的已断开盘符保留规范路径，不阻止比较其他工作区', () => {
  const disconnected = {
    api: path.win32,
    realpath: () => {
      throw Object.assign(new Error('missing drive'), { code: 'ENOENT' });
    },
  };
  expect(pathKey('G:\\旧批次', disconnected)).toBe('g:/旧批次');
  expect(samePath('G:\\旧批次', 'C:\\新批次', disconnected)).toBe(false);
});
