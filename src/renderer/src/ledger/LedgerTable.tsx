import { TextButton } from '../ui.js';
import { useRouteStore } from '../store/route.js';
import styles from './ledger.module.css';

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
  return (
    <div className={styles.tableScroll}>
      <table aria-label={title}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td key={column}>
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
