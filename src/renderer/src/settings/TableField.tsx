import styles from './fields.module.css';
import uiStyles from '../styles/ui.module.css';
import type { ConfigField as Field } from '../../../core/rules/catalog.js';

export function TableField({
  field,
  rows,
  change,
}: {
  field: Field;
  rows: Record<string, unknown>[];
  change: (value: unknown) => void;
}) {
  return (
    <div className={styles.standardsEditor}>
      <h3>{field.label}</h3>
      <div className={uiStyles.tableScroll}>
        <table aria-label={field.label}>
          <thead>
            <tr>
              {field.columns!.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {field.columns!.map((column) => (
                  <td key={column.key}>
                    {column.options ? (
                      <select
                        aria-label={column.label + ' ' + (index + 1)}
                        value={row[column.key] as string}
                        onChange={(e) =>
                          change(
                            rows.map((v, n) =>
                              n === index ? { ...v, [column.key]: e.target.value } : v,
                            ),
                          )
                        }
                      >
                        {column.options.map((o) => (
                          <option value={o.value} key={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={column.label + ' ' + (index + 1)}
                        type={column.type === 'number' ? 'number' : 'text'}
                        min={0}
                        step="any"
                        required
                        value={row[column.key] as string | number}
                        onChange={(e) =>
                          change(
                            rows.map((v, n) =>
                              n === index
                                ? {
                                    ...v,
                                    [column.key]:
                                      column.type === 'number'
                                        ? e.target.valueAsNumber
                                        : e.target.value,
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                    )}
                  </td>
                ))}
                <td>
                  <button type="button" onClick={() => change(rows.filter((_, n) => n !== index))}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() =>
          change([
            ...rows,
            Object.fromEntries(
              field.columns!.map((c) => [
                c.key,
                c.type === 'number' ? 0 : (c.options?.[0]?.value ?? ''),
              ]),
            ),
          ])
        }
      >
        添加标准行
      </button>
    </div>
  );
}
