import styles from './settings/rules.module.css';
import uiStyles from './styles/ui.module.css';
import { Hint } from './ui.js';
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
const sourceGroups = ['readme', 'finance', 'labor', 'practice', 'system'] as const;
const groupOf = (rule: RuleDefinition) => (rule.id.startsWith('L') ? 'labor' : rule.source.kind);
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
              <Hint key={note.id} text={note.sourceText}>
                <div
                  className={styles.retiredRule + ' ' + uiStyles.panel}
                  data-testid={'retired-' + note.id}
                >
                  R14（README 第 14 条）· {note.note}
                  <span className={styles.ruleExcerpt}>原文：{note.sourceText}</span>
                </div>
              </Hint>
            ))}
          </Collapsible>
        );
      })}
      {!filtered.length && !retired.length && <p className={uiStyles.muted}>没有匹配的规则。</p>}
    </div>
  );
}
