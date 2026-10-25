import styles from './rules.module.css';
import uiStyles from '../styles/ui.module.css';
import disclosureStyles from '../styles/disclosure.module.css';
import settingsFieldsStyles from './fields.module.css';
import findingsStyles from '../styles/findings.module.css';
import formsStyles from '../styles/forms.module.css';
import { Hint, Pill } from '../ui.js';
import { useId } from 'react';
import type { RuleConfig } from '../../../core/rules/config.js';
import {
  criteria,
  ruleMeaning,
  type ConfigField,
  type RuleDefinition,
} from '../../../core/rules/catalog.js';
import { Collapsible } from 'radix-ui';
import { ConfigFieldEditor, getConfigValue } from '../ConfigField.js';

const anchor = (id: string) => 'settings-rule-' + encodeURIComponent(id);

export function RuleCard({
  rule,
  rules,
  expanded,
  toggle,
  edit,
  restore,
}: {
  rule: RuleDefinition;
  rules: RuleConfig;
  expanded: boolean;
  toggle: () => void;
  edit: (path: string, value: unknown) => void;
  restore: () => void;
}) {
  const id = useId();
  const option = rules.ruleOptions[rule.id];
  const editor = (field: ConfigField) => (
    <ConfigFieldEditor
      key={field.path}
      field={field}
      value={getConfigValue(rules, field.path)}
      change={(value) => edit(field.path, value)}
    />
  );
  return (
    <Collapsible.Root asChild open={expanded} onOpenChange={toggle}>
      <article
        className={styles.ruleCard + ' ' + uiStyles.panel}
        data-testid={'rule-' + rule.id}
        id={anchor(rule.id)}
      >
        <div className={styles.ruleOverview}>
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className={styles.ruleToggle}
              aria-expanded={expanded}
              aria-controls={id}
            >
              <Hint text={rule.id + ' · ' + rule.name}>
                <span className={styles.ruleLabel}>
                  {rule.id} · {rule.name}
                </span>
              </Hint>
              <Pill tone={option.severity}>
                {{ error: '错误', warning: '警告', info: '提示' }[option.severity]}
              </Pill>
              <Hint text={rule.sourceText}>
                <span className={styles.ruleExcerpt}>{rule.sourceText}</span>
              </Hint>
              <span className={disclosureStyles.disclosureChevron} aria-hidden="true">
                {expanded ? '▾' : '▸'}
              </span>
            </button>
          </Collapsible.Trigger>
          <label className={settingsFieldsStyles.checkboxLabel + ' ' + styles.ruleEnabled}>
            <input
              type="checkbox"
              aria-label={'启用 ' + rule.id}
              checked={option.enabled}
              onChange={(e) => edit(`ruleOptions.${rule.id}.enabled`, e.target.checked)}
            />
            启用
          </label>
        </div>
        <Collapsible.Content asChild forceMount>
          <div hidden={!expanded} id={id} className={styles.ruleCardContent}>
            <p className={uiStyles.muted}>{ruleMeaning(rule)}</p>
            <p className={findingsStyles.sourceText}>原文：{rule.sourceText}</p>
            <Hint text={criteria(rule, rules, { fullKeywords: true })}>
              <p data-testid={'criteria-' + rule.id}>判定口径：{criteria(rule, rules)}</p>
            </Hint>
            <p className={uiStyles.small}>
              怎么处理：
              {rule.action.replaceAll('{group}', '对应组文件夹').replaceAll('{file}', '相关文件')}
            </p>
            <div className={formsStyles.formGrid + ' ' + styles.ruleControls}>
              {editor(rule.config[1]!)}
            </div>
            <div className={styles.ruleFields}>
              {rule.config
                .slice(2)
                .filter((f) => !f.general && !f.labor)
                .map(editor)}
            </div>
            <button type="button" onClick={restore}>
              恢复此项默认
            </button>
          </div>
        </Collapsible.Content>
      </article>
    </Collapsible.Root>
  );
}
