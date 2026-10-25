import styles from './labor.module.css';
import type { LaborManualEntry } from '../../../core/labor/types.js';
import type { LaborDraft } from './useLaborDraft.js';

export function FieldOrigin({
  field,
  model,
  parsed,
}: {
  field: keyof LaborManualEntry;
  model: LaborDraft;
  parsed: object;
}) {
  return (
    <small className={styles.fieldOrigin}>
      {Object.hasOwn(model.draft, field) || !Object.hasOwn(parsed, field) ? '手动' : '解析'}
    </small>
  );
}
export function LaborSelect({
  field,
  label,
  options,
  model,
  parsed,
}: {
  field: keyof LaborManualEntry;
  label: string;
  options: Record<string, string>;
  model: LaborDraft;
  parsed: object;
}) {
  const { draft, fields, setDraft, set } = model;
  const key = field;
  return (
    <label>
      {label}
      <FieldOrigin field={field} model={model} parsed={parsed} />
      <select
        aria-label={label}
        value={(draft[key] ?? (fields as unknown as Record<string, unknown>)[key] ?? '') as string}
        onChange={(e) => {
          if (['studentLevel', 'workTime', 'personnelRole'].includes(key) && !e.target.value) {
            setDraft((old) => {
              const next = { ...old };
              delete next[key];
              return next;
            });
          } else set(key, e.target.value || null);
        }}
      >
        <option value="">待补充</option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
