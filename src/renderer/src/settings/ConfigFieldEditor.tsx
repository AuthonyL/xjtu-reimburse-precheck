import styles from './fields.module.css';
import uiStyles from '../styles/ui.module.css';
import type { ConfigField as Field } from '../../../core/rules/catalog.js';

import { KeywordEditor } from './KeywordEditor.js';
import { TableField } from './TableField.js';
import { MappingField } from './MappingField.js';

export function ConfigFieldEditor({
  field,
  value,
  change,
}: {
  field: Field;
  value: unknown;
  change: (value: unknown) => void;
}) {
  if (field.type === 'keywords')
    return <KeywordEditor label={field.label} value={value as string[]} change={change} />;
  if (field.type === 'boolean')
    return (
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={value as boolean}
          onChange={(e) => change(e.target.checked)}
        />
        {field.label}
      </label>
    );
  if (field.type === 'threshold') {
    const threshold = value as { operator: string; value: number };
    return (
      <label>
        {field.label}
        <span className={uiStyles.inline}>
          <select
            aria-label={field.label + '比较方向'}
            value={threshold.operator}
            onChange={(e) => change({ ...threshold, operator: e.target.value })}
          >
            <option value=">=">≥ 大于或等于</option>
            <option value=">">&gt; 大于</option>
          </select>
          <input
            aria-label={field.label}
            type="number"
            min={0}
            step="any"
            required
            value={Number.isFinite(threshold.value) ? threshold.value : ''}
            onChange={(e) => change({ ...threshold, value: e.target.valueAsNumber })}
          />
        </span>
      </label>
    );
  }
  if (field.multiple)
    return (
      <fieldset className={styles.choiceField}>
        <legend>{field.label}</legend>
        {field.options?.map((option) => (
          <label className={styles.checkboxLabel} key={option.value}>
            <input
              type="checkbox"
              checked={(value as string[]).includes(option.value)}
              onChange={(e) =>
                change(
                  e.target.checked
                    ? [...(value as string[]), option.value]
                    : (value as string[]).filter((v) => v !== option.value),
                )
              }
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    );
  if (field.columns) {
    const rows = value as Record<string, unknown>[];
    return field.type === 'table' ? (
      <TableField field={field} rows={rows} change={change} />
    ) : (
      <MappingField field={field} rows={rows} change={change} />
    );
  }
  if (field.multiline)
    return (
      <label>
        {field.label}
        <textarea
          aria-label={field.label}
          rows={4}
          required
          value={value as string}
          onChange={(e) => change(e.target.value)}
        />
      </label>
    );
  if (field.type === 'table')
    return (
      <label>
        {field.label}
        <textarea
          aria-label={field.label}
          rows={8}
          value={(value as string[]).join('\n---\n')}
          onChange={(e) => change(e.target.value.split('\n---\n'))}
        />
        <span className={uiStyles.small + ' ' + uiStyles.muted}>
          多条理由用单独一行 --- 分隔，第一条用于导出草稿。
        </span>
      </label>
    );
  if (field.options) {
    const options = field.options.some((o) => o.value === value)
      ? field.options
      : [...field.options, { value: String(value), label: String(value) + '（自定义）' }];
    return (
      <label>
        {field.label}
        <select
          aria-label={field.label}
          value={value as string}
          onChange={(e) => change(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label>
      {field.label}
      <input required value={value as string} onChange={(e) => change(e.target.value)} />
    </label>
  );
}
