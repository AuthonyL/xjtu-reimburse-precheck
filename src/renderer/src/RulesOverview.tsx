import styles from './settings/rules.module.css';
import uiStyles from './styles/ui.module.css';
import { useRuleFocus } from './store/route.js';
import { useEffect, useRef, useState } from 'react';
import type { RuleConfig } from '../../core/rules/config.js';
import {
  RULE_CATALOG,
  RETIRED_RULE_NOTES,
  RULE_NUMBERING,
  type RuleDefinition,
} from '../../core/rules/catalog.js';
import { Collapsible } from './Collapsible.js';
import { useDisclosures } from './disclosures.js';
import { RuleCard } from './settings/RuleCard.js';
import { RetiredRules } from './settings/RetiredRules.js';
import { SOURCE_GROUPS, KIND_GROUPS, groupOf, type RuleGrouping } from './settings/rule-groups.js';
const anchor = (id: string) => 'settings-rule-' + encodeURIComponent(id);

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
  const [grouping, setGrouping] = useState<RuleGrouping>('source');
  const groups = grouping === 'source' ? SOURCE_GROUPS : KIND_GROUPS;
  const groupKey = (rule: RuleDefinition) => grouping + ':' + groupOf(rule, grouping);
  const [expanded, setExpanded] = useDisclosures(scope, 'sections');
  const lastFocus = useRef<ReturnType<typeof useRuleFocus>>(null);
  const target = RULE_CATALOG.find((r) => r.id === focusRule?.id);
  useEffect(() => {
    if (!target || !focusRule) return;
    setSearch('');
    setExpanded(
      ['rule:' + target.id, 'source:' + groupOf(target, 'source'), 'kind:' + target.kind],
      true,
    );
  }, [focusRule]);
  useEffect(() => {
    if (
      !target ||
      !focusRule ||
      lastFocus.current === focusRule ||
      search ||
      !expanded['rule:' + target.id] ||
      expanded[groupKey(target)] === false
    )
      return;
    const timer = window.setTimeout(() => {
      document.getElementById(anchor(target.id))?.scrollIntoView?.({ block: 'start' });
      lastFocus.current = focusRule;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expanded, focusRule, search, grouping]);
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const filtered = RULE_CATALOG.filter((rule) =>
    matches(rule.id + ' ' + rule.name + ' ' + rule.sourceText),
  );
  const retired = RETIRED_RULE_NOTES.filter((rule) =>
    matches(rule.id + ' ' + rule.note + ' ' + rule.sourceText),
  );
  return (
    <div className={'rules-overview'}>
      <div className={styles.numberingGuide}>
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
      <div className={uiStyles.actions + ' ' + styles.ruleBulkActions}>
        {(['source', 'kind'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={grouping === value}
            onClick={() => setGrouping(value)}
          >
            {value === 'source' ? '按来源' : '按类型'}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            setExpanded(
              [
                ...filtered.map((r) => 'rule:' + r.id),
                ...Object.keys(groups).map((g) => grouping + ':' + g),
              ],
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
      {Object.entries(groups).map(([source, title]) => {
        const rulesInGroup = filtered
          .filter((r) => groupOf(r, grouping) === source)
          .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
        const notes = source === 'readme' ? retired : [];
        if (!rulesInGroup.length && !notes.length) return null;
        return (
          <Collapsible
            key={grouping + ':' + source}
            scope={scope}
            disclosureKey={grouping + ':' + source}
            title={title}
            summary={`${rulesInGroup.length} 条 · ${rulesInGroup.map((r) => r.id).join('、')}`}
            defaultOpen
            open={expanded[grouping + ':' + source] ?? true}
            onOpenChange={(open) => setExpanded([grouping + ':' + source], open)}
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
            <RetiredRules notes={notes} />
          </Collapsible>
        );
      })}
      {grouping === 'kind' && retired.length > 0 && (
        <section aria-label="已停用编号">
          <h2>已停用编号</h2>
          <RetiredRules notes={retired} />
        </section>
      )}
      {!filtered.length && !retired.length && <p className={uiStyles.muted}>没有匹配的规则。</p>}
    </div>
  );
}
