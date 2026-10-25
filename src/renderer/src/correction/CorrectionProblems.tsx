import styles from '../styles/ui.module.css';
import { Pill } from '../ui.js';
import type { Finding } from '../../../core/types.js';
import type { FileOperation } from '../../../core/correction/types.js';
import { nameOf } from '../ui.js';
export function CorrectionProblems({ items }: { items: Finding[] }) {
  return (
    <ul>
      {items
        .filter((f) => f.severity !== 'info')
        .map((f, n) => (
          <li key={n}>
            <Pill tone={f.severity}>{f.severity === 'error' ? '✗ 错误' : '! 警告'}</Pill> {f.ruleId}{' '}
            · {f.message}
            <p className={styles.small}>怎么处理：{f.action}</p>
            {f.files.length > 0 && (
              <p className={styles.path + ' ' + styles.small}>{f.files.map(nameOf).join('、')}</p>
            )}
          </li>
        ))}
    </ul>
  );
}
export function CorrectionOperations({ operations }: { operations: FileOperation[] }) {
  const names = {
    archive: '移入旧版',
    copy: '复制放入',
    retain: '保留目录内文件',
    'confirm-attachment': '确认附件类型（不复制、不改名）',
  };
  return (
    <ul className={'operation-list'}>
      {operations.map((op, i) => (
        <li key={i}>
          {names[op.kind]}：<span className={styles.path}>{op.from}</span>
          <br />→ <span className={styles.path}>{op.to}</span>
        </li>
      ))}
    </ul>
  );
}
