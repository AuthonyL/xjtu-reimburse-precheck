import { expect, it } from 'vitest';
import { problemKey, compareProblems } from '../src/core/correction/problems.js';
import {
  replacementDestination,
  attachmentDestination,
  newFileDestination,
} from '../src/core/correction/placement.js';
import type { Finding } from '../src/core/types.js';
const f = (values: Partial<Finding> = {}): Finding => ({
  ruleId: 'L1',
  code: 'date',
  severity: 'error',
  message: '合成问题',
  action: '补全',
  files: ['/original/说明.pdf'],
  invoiceNumbers: [],
  ...values,
});
it('问题键忽略绝对根路径、级别和文案，区分同文件同规则不同缺项', () => {
  const before = f();
  const after = f({ files: ['/copy/说明.docx'], message: '新文案', severity: 'warning' });
  expect(problemKey(before, '/original')).toBe(
    problemKey(after, '/copy', { files: { '说明.docx': '说明.pdf' } }),
  );
  expect(problemKey(f({ code: 'mode' }), '/original')).not.toBe(problemKey(before, '/original'));
  expect(problemKey(f({ files: ['C:\\batch\\组\\说明.docx'] }), 'C:\\batch')).toBe(
    problemKey(f({ files: ['/batch/组/说明.docx'] }), '/batch'),
  );
});
it('换号映射防止同一错误换号码后假消失；新增error按重数判断，warning不阻挡', () => {
  const before = f({ ruleId: 'buyer', code: undefined, invoiceNumbers: ['SYNTH-OLD'] });
  const after = f({ ruleId: 'buyer', code: undefined, invoiceNumbers: ['SYNTH-NEW'] });
  const key = problemKey(before, '/original');
  expect(
    compareProblems([before], [after], '/original', '/copy', key, {
      invoiceNumbers: { 'SYNTH-NEW': 'SYNTH-OLD' },
    }).passed,
  ).toBe(false);
  expect(
    compareProblems(
      [before],
      [f({ severity: 'warning', code: 'another' })],
      '/original',
      '/copy',
      key,
    ).passed,
  ).toBe(true);
  const existing = f({ code: 'existing' });
  expect(
    compareProblems([before, existing], [existing, existing], '/original', '/original', key).passed,
  ).toBe(false);
});
it('落点保留原名和新扩展名，同号多格式优先同格式，拒绝可覆盖的冲突', () => {
  expect(replacementDestination(['PCB/票.pdf'], 'updated.pdf', [])).toEqual({
    destination: 'PCB/票.pdf',
    replaced: 'PCB/票.pdf',
  });
  expect(replacementDestination(['PCB/票.pdf'], 'updated.xml', [])).toEqual({
    destination: 'PCB/票.xml',
    replaced: 'PCB/票.pdf',
  });
  expect(replacementDestination(['PCB/票.pdf', 'PCB/数据.xml'], 'new.xml', [])).toEqual({
    destination: 'PCB/数据.xml',
    replaced: 'PCB/数据.xml',
  });
  expect(() => replacementDestination(['说明.pdf'], 'new.docx', ['说明.docx'])).toThrow(/已存在/);
});
it('补交按类型和对象命名，重名加(2)，路径和文件名跨平台安全', () => {
  expect(attachmentDestination('PCB', '支付记录', 'PCB', '.jpg', [])).toBe('PCB/支付记录-PCB.jpg');
  expect(attachmentDestination('', '用途说明', '胶带', '.pdf', ['用途说明-胶带.pdf'])).toBe(
    '用途说明-胶带(2).pdf',
  );
  expect(() => attachmentDestination('../outside', '清单', 'x', '.pdf', [])).toThrow();
  expect(() => replacementDestination(['../outside.pdf'], 'new.pdf', [])).toThrow();
  expect(newFileDestination('PCB', 'NEW.XML', ['PCB/new.xml'])).toBe('PCB/NEW(2).xml');
});
it('目录内路径规范化，Windows 大小写不敏感且跨盘符/前缀相似目录不算目录内', async () => {
  const { existingRelativePath } = await import('../src/core/correction/placement.js');
  const path = await import('node:path');
  expect(existingRelativePath('C:\\Batch', 'c:\\BATCH\\AI\\..\\AI\\a.png', path.win32)).toBe(
    'AI/a.png',
  );
  expect(existingRelativePath('C:\\Batch', 'C:\\Batch2\\a.png', path.win32)).toBeNull();
  expect(existingRelativePath('C:\\Batch', 'D:\\Batch\\a.png', path.win32)).toBeNull();
  expect(existingRelativePath('/batch', '/Batch/a.png', path.posix)).toBeNull();
});
it('Windows 目录内文件按大小写不敏感找到实际相对路径，POSIX 保留大小写区别', async () => {
  const { sameRelativeFile } = await import('../src/core/correction/placement.js');
  expect(sameRelativeFile('AI/Hash.PNG', 'ai/hash.png', true)).toBe(true);
  expect(sameRelativeFile('AI/Hash.PNG', 'ai/hash.png', false)).toBe(false);
  expect(sameRelativeFile('AI/hash.png', 'AI/other.png', true)).toBe(false);
});
it('补交来源短路径和工作区长路径仍能识别为目录内', async () => {
  const { existingRelativePath } = await import('../src/core/correction/placement.js');
  const { win32 } = await import('node:path');
  const native = (p: string) => p.replace('RUNNER~1', 'runneradmin');
  expect(
    existingRelativePath(
      'C:\\Users\\RUNNER~1\\batch',
      'C:\\Users\\runneradmin\\batch\\AI\\a.png',
      win32,
      native,
    ),
  ).toBe('AI/a.png');
});
