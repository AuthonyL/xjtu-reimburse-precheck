import { useRouteStore } from './store/route.js';
import { useEffect, useId, useState } from 'react';
import type { Finding, Severity } from '../../core/types.js';
import { ruleDefinition } from '../../core/rules/catalog.js';
import { FileLink, nameOf } from './ui.js';
import { useFindingFeedback } from './Feedback.js';
import { RuleHelp, ruleTitle } from './RuleHelp.js';
import { CorrectionAction, CorrectionDrop } from './SingleFileCheck.js';
import { findingDisclosureKey, useDisclosures } from './disclosures.js';
import { FindingWaiver } from './ClaimStatus.js';

export interface FindingContext {
  finding: Finding;
  file?: string;
  group?: string;
  reason?: string;
  canCorrect?: boolean;
  waiverReason?: string;
}
const levels = { error: '✗ 错误', warning: '! 警告', info: 'i 提示' };
const ruleNames = (finding: Finding, field: 'name' | 'description') =>
  finding.ruleId
    .split('/')
    .map((id) => ruleDefinition(id)?.[field])
    .filter(Boolean)
    .join(' / ');

export function FindingItem({
  finding,
  scope = '',
  file,
  group,
  reason,
  canCorrect = true,
  expanded,
  toggle,
  waiverReason,
}: FindingContext & {
  scope?: string;
  expanded: boolean;
  toggle: () => void;
}) {
  const select = useRouteStore((state) => state.select);
  const selected = useRouteStore((state) => state.route.dir);
  const locate = selected === scope ? (group: string) => select(scope, group) : undefined;
  const detailsId = useId();
  const feedback = useFindingFeedback(finding, scope);
  const waived = finding.resolution === 'waived';
  const severity = waived ? 'info' : finding.severity;
  const location =
    group ??
    finding.groupId ??
    (file ? nameOf(file) : finding.files[0] ? nameOf(finding.files[0]) : '');
  return (
    <CorrectionDrop
      className={'finding ' + severity}
      finding={waived ? { ...finding, severity } : finding}
      file={file}
    >
      <button
        type="button"
        className="finding-summary"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={toggle}
      >
        <span
          className={'finding-level ' + severity}
          title={levels[severity]}
          aria-label={levels[severity]}
        >
          {levels[severity].split(' ')[0]}
        </span>
        <span className="finding-rule" title={ruleTitle(finding.ruleId)}>
          <span>{finding.ruleId}</span>
          <span className="finding-rule-name"> · {ruleNames(finding, 'name')}</span>
        </span>
        <span className="finding-title" title={finding.message}>
          {finding.message}
        </span>
        <span className="finding-location" title={location}>
          {location}
        </span>
        {!!finding.invoiceNumbers.length && (
          <span className="finding-invoice-count">{finding.invoiceNumbers.length} 张票</span>
        )}
        {feedback.marked && <span className="feedback-mark">已反馈</span>}
        <span className="disclosure-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div id={detailsId} className="finding-details">
          <strong>
            {finding.ruleId} · {ruleNames(finding, 'name')} · {finding.message}
          </strong>
          <p>
            <span className="muted">原因：</span>
            {reason ?? (ruleNames(finding, 'description') || finding.message)}
          </p>
          <p className="finding-action">
            <span className="muted">怎么处理：</span>
            {finding.action}
          </p>
          {!!finding.invoiceNumbers.length && (
            <p className="muted small">涉及发票：{finding.invoiceNumbers.join('、')}</p>
          )}
          <RuleHelp finding={finding} />
          <div className="actions">
            {finding.files.map((path) => (
              <FileLink key={path} file={path} />
            ))}
          </div>
          <div className="actions">
            {feedback.mark && (
              <button type="button" className="text-button" onClick={feedback.mark}>
                这条不对
              </button>
            )}
            {canCorrect && !waived && finding.severity !== 'info' && (
              <CorrectionAction finding={finding} file={file} />
            )}
            {locate && group && (
              <button
                className="text-button"
                title={'定位到 ' + group}
                onClick={() => locate(group)}
              >
                定位到分组 →
              </button>
            )}
          </div>
          <FindingWaiver
            scope={scope}
            findingId={finding.id}
            waived={waived}
            reason={waiverReason}
          />
        </div>
      )}
    </CorrectionDrop>
  );
}

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
      <div className="issue-level" role="region" aria-label={label} key={severity}>
        <div className="issue-heading">
          <h3>
            {label} {rows.length}
          </h3>
          <div className="rule-filters">
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
          <div className="disclosure-actions">
            <button
              className="text-button"
              disabled={!visible.length}
              onClick={() => setExpanded(keys, true)}
            >
              全部展开
            </button>
            <button
              className="text-button"
              disabled={!visible.length}
              onClick={() => setExpanded(keys, false)}
            >
              全部收起
            </button>
          </div>
        </div>
        <div className="panel findings">
          {visible.length ? (
            visible.map(item)
          ) : (
            <p className="muted">{rows.length ? '此级别没有符合筛选的问题' : '暂无' + label}</p>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="finding-list">
      {section('error')}
      {section('warning')}
      {infoCount > 0 && (
        <div className="info-findings">
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
        <div className="info-findings">
          <button aria-expanded={showWaived} onClick={() => setShowWaived(!showWaived)}>
            已豁免 {waived.length} 条
          </button>
          {showWaived && <div className="panel findings">{waived.map(item)}</div>}
        </div>
      )}
    </div>
  );
}
