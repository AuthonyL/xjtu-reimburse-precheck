import { TextButton } from '../ui.js';
import { useRouteStore } from '../store/route.js';
import styles from './ledger.module.css';
import uiStyles from '../styles/ui.module.css';

export function LedgerTable({
  title,
  columns,
  rows,
  dirs,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  dirs?: string[];
}) {
  const select = useRouteStore((state) => state.select);
  const numeric = (column: string) => ['张数', 'CNY 合计', '金额', '豁免数'].includes(column);
  return (
    <div className={styles.tableScroll}>
      <table aria-label={title}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className={numeric(column) ? uiStyles.numeric : undefined}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td
                  key={column}
                  className={numeric(columns[column] ?? '') ? uiStyles.numeric : undefined}
                >
                  {column === 0 && dirs?.[index] ? (
                    <TextButton onClick={() => select(dirs[index]!)}>{cell}</TextButton>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
