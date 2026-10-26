import styles from './styles/findings.module.css';
import disclosureStyles from './styles/disclosure.module.css';
import uiStyles from './styles/ui.module.css';
import { TextButton } from './ui.js';
import { useEffect, useState } from 'react';
import { findingDisclosureKey, useDisclosures } from './disclosures.js';
import { FindingItem, type FindingContext } from './FindingItem.js';

const labels = { error: '错误', warning: '警告', info: '提示', waived: '已豁免' };
type Level = keyof typeof labels;
const levels = Object.keys(labels) as Level[];
const levelOf = ({ finding }: FindingContext): Level =>
  finding.resolution === 'waived' ? 'waived' : finding.severity;

export function FindingList({ scope, findings }: { scope: string; findings: FindingContext[] }) {
  const [expanded, setExpanded] = useDisclosures(scope, 'findings');
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Level[]>(['error', 'warning']);
  const active = findings.filter((row) => selected.includes(levelOf(row)));
  useEffect(() => {
    if (filter && !active.some(({ finding }) => finding.ruleId === filter)) setFilter(null);
  }, [findings, filter, selected]);
  const counts = new Map<string, number>();
  active.forEach(({ finding }) =>
    counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1),
  );
  const rules = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const visible = active
    .filter(({ finding }) => !filter || finding.ruleId === filter)
    .sort((a, b) => levels.indexOf(levelOf(a)) - levels.indexOf(levelOf(b)));
  const keys = visible.map(({ finding }) => findingDisclosureKey(finding, scope));
  return (
    <div className={styles.findingList}>
      <div className={disclosureStyles.issueHeading}>
        <div className={disclosureStyles.ruleFilters} role="group" aria-label="问题级别">
          {levels.map((level) => (
            <button
              type="button"
              key={level}
              aria-pressed={selected.includes(level)}
              onClick={() =>
                setSelected((current) =>
                  current.includes(level)
                    ? current.filter((value) => value !== level)
                    : [...current, level],
                )
              }
            >
              {labels[level]} {findings.filter((row) => levelOf(row) === level).length}
            </button>
          ))}
        </div>
        <div className={disclosureStyles.disclosureActions}>
          <TextButton disabled={!visible.length} onClick={() => setExpanded(keys, true)}>
            全部展开
          </TextButton>
          <TextButton disabled={!visible.length} onClick={() => setExpanded(keys, false)}>
            全部收起
          </TextButton>
        </div>
      </div>
      <div className={disclosureStyles.ruleFilters} role="group" aria-label="规则筛选">
        {rules.map(([id, count]) => (
          <button
            type="button"
            key={id}
            aria-label={'只看规则 ' + id}
            aria-pressed={filter === id}
            onClick={() => setFilter(filter === id ? null : id)}
          >
            {id} ×{count}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className={styles.findings} role="list" aria-label="问题列表">
          {visible.map((row) => {
            const key = findingDisclosureKey(row.finding, scope);
            return (
              <FindingItem
                key={key}
                scope={scope}
                {...row}
                expanded={!!expanded[key]}
                toggle={() => setExpanded([key], !expanded[key])}
              />
            );
          })}
        </div>
      ) : (
        <p className={uiStyles.muted}>暂无符合筛选的问题</p>
      )}
    </div>
  );
}
