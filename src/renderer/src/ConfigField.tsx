import { Collapsible } from './Collapsible.js';
import { useState } from 'react';
import type { ConfigField as Field } from '../../core/rules/catalog.js';

export function getConfigValue(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value);
}
export function setConfigValue(value: unknown, path: string, next: unknown): void {
  const parts = path.split('.');
  const parent = parts
    .slice(0, -1)
    .reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value);
  (parent as Record<string, unknown>)[parts.at(-1)!] = next;
}
export function KeywordEditor({
  label,
  value,
  change,
}: {
  label: string;
  value: string[];
  change: (value: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const text = input.trim();
    if (text) change([...new Set([...value, text])]);
    setInput('');
  };
  return (
    <div className="keyword-editor">
      <label>
        {label}
        <input
          aria-label={label}
          value={input}
          placeholder="输入关键字，按回车添加"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
      </label>
      <div className="keyword-tags">
        {value.map((keyword) => (
          <span className="keyword-tag" key={keyword}>
            {keyword}
            <button
              type="button"
              aria-label={'删除 ' + keyword}
              onClick={() => change(value.filter((v) => v !== keyword))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
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
      <label className="checkbox-label">
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
        <span className="inline">
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
      <fieldset className="choice-field">
        <legend>{field.label}</legend>
        {field.options?.map((option) => (
          <label className="checkbox-label" key={option.value}>
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
    if (field.type === 'table')
      return (
        <div className="standards-editor">
          <h3>{field.label}</h3>
          <div className="table-scroll">
            <table aria-label={field.label}>
              <thead>
                <tr>
                  {field.columns.map((c) => (
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
                      <button
                        type="button"
                        onClick={() => change(rows.filter((_, n) => n !== index))}
                      >
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
    return (
      <div className="mapping-editor">
        <h3>{field.label}</h3>
        {rows.map((row, index) => (
          <div className="mapping-row" key={index}>
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
        <span className="small muted">多条理由用单独一行 --- 分隔，第一条用于导出草稿。</span>
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

export function ConfigFieldDisclosure({
  scope,
  field,
  value,
  change,
}: {
  scope: string;
  field: Field;
  value: unknown;
  change: (value: unknown) => void;
}) {
  const count = Array.isArray(value) ? value.length : null;
  const summary =
    count !== null
      ? `${field.type === 'keywords' ? '关键字' : field.type === 'mapping' ? '映射' : '选项'} ${count} 个`
      : `当前：${String(value)}`;
  return (
    <Collapsible
      scope={scope}
      disclosureKey={'config:' + field.path}
      title={field.label}
      summary={summary}
      level={3}
    >
      <ConfigFieldEditor field={field} value={value} change={change} />
    </Collapsible>
  );
}
