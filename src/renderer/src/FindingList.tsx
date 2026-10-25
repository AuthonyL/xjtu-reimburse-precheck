import styles from './styles/findings.module.css';
import disclosureStyles from './styles/disclosure.module.css';
import uiStyles from './styles/ui.module.css';
import { TextButton } from './ui.js';
import { useEffect, useState } from 'react';
import type { Severity } from '../../core/types.js';
import { findingDisclosureKey, useDisclosures } from './disclosures.js';
import { FindingItem, type FindingContext } from './FindingItem.js';

export function FindingList({ scope, findings }: { scope: string; findings: FindingContext[] }) {
  const [expanded, setExpanded] = useDisclosures(scope, 'findings');
  const [filter, setFilter] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showWaived, setShowWaived] = useState(false);
  const active = findings.filter(({ finding }) => finding.resolution !== 'waived');
  const waived = findings.filter(({ finding }) => finding.resolution === 'waived');
  useEffect(() => {
    if (
      filter &&
      !findings.some(
        ({ finding }) =>
          finding.resolution !== 'waived' &&
          finding.ruleId === filter &&
          (showInfo || finding.severity !== 'info'),
      )
    )
      setFilter(null);
  }, [findings, filter, showInfo]);
  const infoCount = active.filter(({ finding }) => finding.severity === 'info').length;
  const item = (row: FindingContext) => {
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
  };
  const section = (severity: Severity) => {
    const rows = active.filter(({ finding }) => finding.severity === severity);
    const visible = rows.filter(({ finding }) => !filter || finding.ruleId === filter);
    const counts = new Map<string, number>();
    rows.forEach(({ finding }) =>
      counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1),
    );
    const rules = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const keys = visible.map(({ finding }) => findingDisclosureKey(finding, scope));
    const label = { error: '错误', warning: '警告', info: '提示' }[severity];
    return (
      <div className={styles.issueLevel} role="region" aria-label={label} key={severity}>
        <div className={disclosureStyles.issueHeading}>
          <h3>
            {label} {rows.length}
          </h3>
          <div className={disclosureStyles.ruleFilters}>
            {rules.map(([id, count]) => (
              <button
                key={id}
                aria-label={'只看规则 ' + id}
                aria-pressed={filter === id}
                onClick={() => setFilter(filter === id ? null : id)}
              >
                {id} ×{count}
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
        <div className={uiStyles.panel + ' ' + styles.panelSurface + ' ' + styles.findings}>
          {visible.length ? (
            visible.map(item)
          ) : (
            <p className={uiStyles.muted}>
              {rows.length ? '此级别没有符合筛选的问题' : '暂无' + label}
            </p>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className={styles.findingList}>
      {section('error')}
      {section('warning')}
      {infoCount > 0 && (
        <div className={styles.infoFindings}>
          <button
            aria-expanded={showInfo}
            onClick={() => {
              if (
                showInfo &&
                filter &&
                !active.some(
                  ({ finding }) => finding.severity !== 'info' && finding.ruleId === filter,
                )
              )
                setFilter(null);
              setShowInfo(!showInfo);
            }}
          >
            {showInfo ? '收起提示' : `显示 ${infoCount} 条提示`}
          </button>
          {showInfo && section('info')}
        </div>
      )}
      {waived.length > 0 && (
        <div className={styles.infoFindings}>
          <button aria-expanded={showWaived} onClick={() => setShowWaived(!showWaived)}>
            已豁免 {waived.length} 条
          </button>
          {showWaived && (
            <div className={uiStyles.panel + ' ' + styles.panelSurface + ' ' + styles.findings}>
              {waived.map(item)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
