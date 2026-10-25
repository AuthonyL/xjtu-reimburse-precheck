import styles from '../styles/ui.module.css';
import laborLaborStyles from './labor.module.css';
import type { LaborEntry } from '../../../core/labor/types.js';
import { FileLink } from '../ui.js';

export function StandardsTable({
  standards,
  requirements,
}: Pick<LaborEntry, 'standards' | 'requirements'>) {
  return (
    <>
      <p className={styles.small + ' ' + styles.muted}>
        《西安交通大学评审费等项目开支管理办法》；横向和其他经费同时核对，具体口径以学校最新要求为准。
      </p>
      {standards.map((s, n) => (
        <div
          key={n}
          className={laborLaborStyles.standardRow + ' ' + (laborLaborStyles[s.position] ?? '')}
        >
          <span>{s.label}</span>
          <strong>
            {
              {
                below: '↓ 低于下限',
                within: '✓ 区间内',
                above: '✗ 超过上限',
                unknown: '? 单价待补',
              }[s.position]
            }
          </strong>
        </div>
      ))}
      {!standards.length && <p>未确定适用标准，按上方问题补充条件；关闭 L3 时不检查。</p>}
      {requirements.map((r) => (
        <div key={r.type}>
          {r.status === 'found' ? '✓ 已找到' : '✗ 缺失'} {r.label}
          {r.files.map((f) => (
            <FileLink key={f.path} file={f.path} />
          ))}
        </div>
      ))}
    </>
  );
}
