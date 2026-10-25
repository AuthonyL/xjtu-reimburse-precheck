import styles from './fields.module.css';
import type { ConfigField as Field } from '../../../core/rules/catalog.js';

import { KeywordEditor } from './KeywordEditor.js';

export function MappingField({
  field,
  rows,
  change,
}: {
  field: Field;
  rows: Record<string, unknown>[];
  change: (value: unknown) => void;
}) {
  return (
    <div className={'mapping-editor'}>
      <h3>{field.label}</h3>
      {rows.map((row, index) => (
        <div className={styles.mappingRow} key={index}>
          {field.columns!.map((column) =>
            column.type === 'keywords' ? (
              <KeywordEditor
                key={column.key}
                label={column.label + ' ' + (index + 1)}
                value={row[column.key] as string[]}
                change={(keywords) =>
                  change(rows.map((v, n) => (n === index ? { ...v, [column.key]: keywords } : v)))
                }
              />
            ) : (
              <label key={column.key}>
                {column.label + ' ' + (index + 1)}
                <input
                  required
                  value={row[column.key] as string}
                  onChange={(e) =>
                    change(
                      rows.map((v, n) =>
                        n === index ? { ...v, [column.key]: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
            ),
          )}
          <button type="button" onClick={() => change(rows.filter((_, n) => n !== index))}>
            删除此行
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          change([
            ...rows,
            Object.fromEntries(
              field.columns!.map((column) => [column.key, column.type === 'keywords' ? [] : '']),
            ),
          ])
        }
      >
        添加映射
      </button>
    </div>
  );
}
