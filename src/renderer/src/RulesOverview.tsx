import { useRuleFocus } from './store/route.js';
import { useEffect, useRef, useState, useId } from 'react';
import type { RuleConfig } from '../../core/rules/config.js';
import {
  RULE_CATALOG,
  RETIRED_RULE_NOTES,
  RULE_NUMBERING,
  criteria,
  ruleMeaning,
  type ConfigField,
  type RuleDefinition,
} from '../../core/rules/catalog.js';
import { Collapsible } from './Collapsible.js';
import { useDisclosures } from './disclosures.js';
import { ConfigFieldEditor, getConfigValue } from './ConfigField.js';
const sourceGroups = ['readme', 'finance', 'labor', 'practice', 'system'] as const;
const groupOf = (rule: RuleDefinition) => (rule.id.startsWith('L') ? 'labor' : rule.source.kind);
const anchor = (id: string) => 'settings-rule-' + encodeURIComponent(id);

function RuleCard({
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
    <article className="rule-card panel" data-testid={'rule-' + rule.id} id={anchor(rule.id)}>
      <div className="rule-overview">
        <button
          type="button"
          className="rule-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={toggle}
        >
          <span className="rule-label" title={rule.id + ' · ' + rule.name}>
            {rule.id} · {rule.name}
          </span>
          <span className={'pill ' + option.severity}>
            {{ error: '错误', warning: '警告', info: '提示' }[option.severity]}
          </span>
          <span className="rule-excerpt" title={rule.sourceText}>
            {rule.sourceText}
          </span>
          <span className="disclosure-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        </button>
        <label className="checkbox-label rule-enabled">
          <input
            type="checkbox"
            aria-label={'启用 ' + rule.id}
            checked={option.enabled}
            onChange={(e) => edit(`ruleOptions.${rule.id}.enabled`, e.target.checked)}
          />
          启用
        </label>
      </div>
      <div hidden={!expanded} id={id} className="rule-card-content">
        <p className="muted">{ruleMeaning(rule)}</p>
        <p className="source-text">原文：{rule.sourceText}</p>
        <p
          data-testid={'criteria-' + rule.id}
          title={criteria(rule, rules, { fullKeywords: true })}
        >
          判定口径：{criteria(rule, rules)}
        </p>
        <p className="small">
          怎么处理：
          {rule.action.replaceAll('{group}', '对应组文件夹').replaceAll('{file}', '相关文件')}
        </p>
        <div className="form-grid rule-controls">{editor(rule.config[1]!)}</div>
        <div className="rule-fields">
          {rule.config
            .slice(2)
            .filter((f) => !f.general && !f.labor)
            .map(editor)}
        </div>
        <button type="button" onClick={restore}>
          恢复此项默认
        </button>
      </div>
    </article>
  );
}

export function RulesOverview({
  rules,
  scope,
  edit,
  restore,
}: {
  rules: RuleConfig;
  scope: string;
  edit: (path: string, value: unknown) => void;
  restore: (rule: RuleDefinition) => void;
}) {
  const focusRule = useRuleFocus();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useDisclosures(scope, 'sections');
  const lastFocus = useRef<ReturnType<typeof useRuleFocus>>(null);
  const target = RULE_CATALOG.find((r) => r.id === focusRule?.id);
  useEffect(() => {
    if (!target || !focusRule) return;
    setSearch('');
    setExpanded(['rule:' + target.id, 'source:' + groupOf(target)], true);
  }, [focusRule]);
  useEffect(() => {
    if (
      !target ||
      !focusRule ||
      lastFocus.current === focusRule ||
      search ||
      !expanded['rule:' + target.id] ||
      expanded['source:' + groupOf(target)] === false
    )
      return;
    const timer = window.setTimeout(() => {
      document.getElementById(anchor(target.id))?.scrollIntoView?.({ block: 'start' });
      lastFocus.current = focusRule;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expanded, focusRule, search]);
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const filtered = RULE_CATALOG.filter((rule) =>
    matches(rule.id + ' ' + rule.name + ' ' + rule.sourceText),
  );
  const retired = RETIRED_RULE_NOTES.filter((rule) =>
    matches(rule.id + ' ' + rule.note + ' ' + rule.sourceText),
  );
  return (
    <div className="rules-overview">
      <div className="numbering-guide">
        {RULE_NUMBERING.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <label>
        搜索规则
        <input
          type="search"
          aria-label="搜索规则"
          placeholder="编号、名称或原文"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="actions rule-bulk-actions">
        <button
          type="button"
          onClick={() =>
            setExpanded(
              [...filtered.map((r) => 'rule:' + r.id), ...sourceGroups.map((g) => 'source:' + g)],
              true,
            )
          }
        >
          全部展开
        </button>
        <button
          type="button"
          onClick={() =>
            setExpanded(
              filtered.map((r) => 'rule:' + r.id),
              false,
            )
          }
        >
          全部收起
        </button>
      </div>
      {sourceGroups.map((source) => {
        const rulesInGroup = filtered
          .filter((r) => groupOf(r) === source)
          .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
        const notes = source === 'readme' ? retired : [];
        if (!rulesInGroup.length && !notes.length) return null;
        return (
          <Collapsible
            key={source}
            scope={scope}
            disclosureKey={'source:' + source}
            title={
              {
                readme: 'README 规则',
                finance: '财务补充',
                labor: '劳务费',
                practice: '课题组惯例',
                system: '系统检查',
              }[source]
            }
            summary={`${rulesInGroup.length} 条 · ${rulesInGroup.map((r) => r.id).join('、')}`}
            defaultOpen
            open={expanded['source:' + source] ?? true}
            onOpenChange={(open) => setExpanded(['source:' + source], open)}
          >
            {rulesInGroup.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                rules={rules}
                expanded={expanded['rule:' + rule.id] ?? false}
                toggle={() => setExpanded(['rule:' + rule.id], !expanded['rule:' + rule.id])}
                edit={edit}
                restore={() => restore(rule)}
              />
            ))}
            {notes.map((note) => (
              <div
                className="retired-rule panel"
                data-testid={'retired-' + note.id}
                key={note.id}
                title={note.sourceText}
              >
                R14（README 第 14 条）· {note.note}
                <span className="rule-excerpt">原文：{note.sourceText}</span>
              </div>
            ))}
          </Collapsible>
        );
      })}
      {!filtered.length && !retired.length && <p className="muted">没有匹配的规则。</p>}
    </div>
  );
}
