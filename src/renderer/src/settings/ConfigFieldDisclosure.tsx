import { Collapsible } from '../Collapsible.js';
import type { ConfigField as Field } from '../../../core/rules/catalog.js';
import { ConfigFieldEditor } from './ConfigFieldEditor.js';

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
