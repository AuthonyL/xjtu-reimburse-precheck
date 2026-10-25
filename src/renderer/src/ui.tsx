import styles from './styles/ui.module.css';
import { useRun } from './store/status.js';
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { Tooltip } from 'radix-ui';
import type { Report } from '../../core/types.js';
import { countSeverities } from '../../core/report.js';

import { ATTACHMENT_LABELS } from '../../core/rules/catalog.js';
export const materialNames = { ...ATTACHMENT_LABELS, payment: '支付记录' };
export const money = (value: number) =>
  value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nameOf = (file: string) => file.split(/[\\/]/).pop() ?? file;
export function TextButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={styles.textButton + (className ? ' ' + className : '')} {...props} />;
}
export function Pill({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={'pill' + (tone ? ' ' + tone : '')}>{children}</span>;
}
export function Money({ value }: { value: number }) {
  return <>{money(value)}</>;
}
export function Hint({ text, children }: { text?: string; children: ReactElement }) {
  if (!text) return children;
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild data-tooltip={text}>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={styles.tooltip} sideOffset={5}>
            {text}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
export function FileLink({ file }: { file: string }) {
  const run = useRun();
  return (
    <span className={styles.fileLink}>
      <Hint text={file}>
        <TextButton onClick={() => void run(() => window.precheck.openFile(file))}>
          {nameOf(file)}
        </TextButton>
      </Hint>
      <TextButton
        className={styles.subtle}
        aria-label={'在文件夹中显示 ' + nameOf(file)}
        onClick={() => void run(() => window.precheck.revealFile(file))}
      >
        在文件夹中显示
      </TextButton>
    </span>
  );
}
export function Counts({ report, className = '' }: { report: Report; className?: string }) {
  const counts = countSeverities(report.findings);
  return (
    <span className={styles.counts + (className ? ' ' + className : '')}>
      {(['error', 'warning', 'info'] as const).map((level) => (
        <Pill key={level} tone={level}>
          {{ error: '✗ 错误', warning: '! 警告', info: 'i 提示' }[level]} {counts[level]}
        </Pill>
      ))}
    </span>
  );
}
