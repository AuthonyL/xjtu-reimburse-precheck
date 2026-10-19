import type { AttachmentType, Report } from '../../core/types.js';

import { ATTACHMENT_LABELS } from '../../core/rules/catalog.js';
export const materialNames = { ...ATTACHMENT_LABELS, payment: '支付记录' };
export const money = (value: number) =>
  value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nameOf = (file: string) => file.split(/[\\/]/).pop() ?? file;
export type Run = (action: () => Promise<unknown>, success?: string) => Promise<void>;
export function FileLink({ file, run }: { file: string; run: Run }) {
  return (
    <span className="file-link">
      <button
        className="text-button"
        title={file}
        onClick={() => void run(() => window.precheck.openFile(file))}
      >
        {nameOf(file)}
      </button>
      <button
        className="text-button subtle"
        aria-label={'在文件夹中显示 ' + nameOf(file)}
        onClick={() => void run(() => window.precheck.revealFile(file))}
      >
        在文件夹中显示
      </button>
    </span>
  );
}
export function Counts({ report }: { report: Report }) {
  return (
    <span className="counts">
      {(['error', 'warning', 'info'] as const).map((level) => (
        <span key={level} className={'pill ' + level}>
          {{ error: '✗ 错误', warning: '! 警告', info: 'i 提示' }[level]}{' '}
          {report.findings.filter((f) => f.severity === level).length}
        </span>
      ))}
    </span>
  );
}
