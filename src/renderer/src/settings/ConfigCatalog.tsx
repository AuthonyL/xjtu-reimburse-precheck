import type { RuleConfig } from '../../../core/rules/config.js';
import type { ConfigField } from '../../../core/rules/catalog.js';
import { ConfigFieldEditor } from './ConfigFieldEditor.js';
import { ConfigFieldDisclosure } from './ConfigFieldDisclosure.js';
import { getConfigValue } from './config-values.js';

export function ConfigCatalog({
  items,
  rules,
  scope,
  edit,
  folded = false,
}: {
  items: ConfigField[];
  rules: RuleConfig;
  scope: string;
  edit: (path: string, value: unknown) => void;
  folded?: boolean;
}) {
  const fields = (items: ConfigField[]) =>
    items.map((field) => (
      <ConfigFieldEditor
        key={field.path}
        field={field}
        value={getConfigValue(rules, field.path)}
        change={(value) => edit(field.path, value)}
      />
    ));
  const foldedFields = (items: ConfigField[]) =>
    items.map((field) => (
      <ConfigFieldDisclosure
        key={field.path}
        scope={scope}
        field={field}
        value={getConfigValue(rules, field.path)}
        change={(value) => edit(field.path, value)}
      />
    ));
  return folded ? foldedFields(items) : fields(items);
}
