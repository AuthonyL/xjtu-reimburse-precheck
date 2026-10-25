import { useRef, useState, useEffect } from 'react';
import type { BatchView } from '../../../shared/api.js';
import { compareBatches } from '../../../core/batch-order.js';
import { OverviewRow } from './OverviewRow.js';
import { BulkActions } from './BulkActions.js';
import styles from './overview.module.css';

export function OverviewTable({ batches }: { batches: BatchView[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const all = useRef<HTMLInputElement>(null);
  const sorted = [...batches].sort((a, b) => compareBatches(a.batch, b.batch));
  const selectable = sorted.filter((row) => !row.readOnly);
  const picked = selectable.filter((row) => selected.includes(row.batch.dir));
  useEffect(() => {
    if (all.current)
      all.current.indeterminate = picked.length > 0 && picked.length < selectable.length;
  }, [picked.length, selectable.length]);
  return (
    <section aria-label="报销批次">
      {picked.length > 0 && <BulkActions selected={picked} />}
      <div className={styles.tableScroll}>
        <table aria-label="报销批次">
          <thead>
            <tr>
              <th>
                <input
                  ref={all}
                  type="checkbox"
                  aria-label="全选批次"
                  disabled={!selectable.length}
                  checked={selectable.length > 0 && picked.length === selectable.length}
                  onChange={(event) =>
                    setSelected(event.target.checked ? selectable.map((row) => row.batch.dir) : [])
                  }
                />
              </th>
              {[
                '批次',
                '状态',
                '开票日期 / 批次日期',
                '张数',
                'CNY 合计',
                '错误 / 警告 / 已豁免',
                '学校报销单',
                '最近流转',
              ].map((title) => (
                <th key={title}>{title}</th>
              ))}
            </tr>
          </thead>
          {sorted.map((row) => (
            <OverviewRow
              key={row.batch.dir}
              row={row}
              checked={selected.includes(row.batch.dir)}
              onCheck={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...current.filter((dir) => dir !== row.batch.dir), row.batch.dir]
                    : current.filter((dir) => dir !== row.batch.dir),
                )
              }
            />
          ))}
        </table>
      </div>
      {!batches.length && <p className={styles.note}>当前工作区没有报销批次。</p>}
      <p className={styles.note}>金额为已知人民币合计，未折算票据请展开支出合计查看。</p>
    </section>
  );
}
