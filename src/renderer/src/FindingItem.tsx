import styles from './styles/disclosure.module.css';
import feedbackFeedbackStyles from './feedback/feedback.module.css';
import uiStyles from './styles/ui.module.css';
import findingsStyles from './styles/findings.module.css';
import { Hint, TextButton } from './ui.js';
import { useRouteStore } from './store/route.js';
import { useId } from 'react';
import { Collapsible } from 'radix-ui';
import type { Finding } from '../../core/types.js';
import { ruleDefinition } from '../../core/rules/catalog.js';
import { FileLink, nameOf } from './ui.js';
import { useFindingFeedback } from './Feedback.js';
import { RuleHelp, ruleTitle } from './RuleHelp.js';
import { CorrectionAction, CorrectionDrop } from './SingleFileCheck.js';
import { FindingWaiver } from './claim/ClaimStatus.js';

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
    <Collapsible.Root asChild open={expanded} onOpenChange={toggle}>
      <CorrectionDrop
        className={'finding' + ' ' + severity}
        role="listitem"
        finding={waived ? { ...finding, severity } : finding}
        file={file}
      >
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className={styles.findingSummary}
            aria-expanded={expanded}
            aria-controls={detailsId}
          >
            <Hint text={levels[severity]}>
              <span
                className={styles.findingLevel + ' ' + severity}

                aria-label={levels[severity]}
              >
                {levels[severity].split(' ')[0]}
              </span>
            </Hint>
            <Hint text={ruleTitle(finding.ruleId)}>
              <span className={styles.findingRule}>
                <span>{finding.ruleId}</span>
                <span className={styles.findingRuleName}> · {ruleNames(finding, 'name')}</span>
              </span>
            </Hint>
            <Hint text={finding.message}>
              <span className={styles.findingTitle}>{finding.message}</span>
            </Hint>
            <Hint text={location}>
              <span className={styles.findingLocation}>{location}</span>
            </Hint>
            {!!finding.invoiceNumbers.length && (
              <span className={styles.findingInvoiceCount}>
                {finding.invoiceNumbers.length} 张票
              </span>
            )}
            {feedback.marked && <span className={feedbackFeedbackStyles.feedbackMark}>已反馈</span>}
            <span className={styles.disclosureChevron} aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
          </button>
        </Collapsible.Trigger>
        {expanded && (
          <Collapsible.Content asChild>
            <div id={detailsId} className={styles.findingDetails}>
              <strong>
                {finding.ruleId} · {ruleNames(finding, 'name')} · {finding.message}
              </strong>
              <p>
                <span className={uiStyles.muted}>原因：</span>
                {reason ?? (ruleNames(finding, 'description') || finding.message)}
              </p>
              <p className={findingsStyles.findingAction}>
                <span className={uiStyles.muted}>怎么处理：</span>
                {finding.action}
              </p>
              {!!finding.invoiceNumbers.length && (
                <p className={uiStyles.muted + ' ' + uiStyles.small}>
                  涉及发票：{finding.invoiceNumbers.join('、')}
                </p>
              )}
              <RuleHelp finding={finding} />
              <div className={uiStyles.actions}>
                {finding.files.map((path) => (
                  <FileLink key={path} file={path} />
                ))}
              </div>
              <div className={uiStyles.actions}>
                {feedback.mark && (
                  <TextButton type="button" onClick={feedback.mark}>
                    这条不对
                  </TextButton>
                )}
                {canCorrect && !waived && finding.severity !== 'info' && (
                  <CorrectionAction finding={finding} file={file} />
                )}
                {locate && group && (
                  <Hint text={'定位到 ' + group}>
                    <TextButton onClick={() => locate(group)}>定位到分组 →</TextButton>
                  </Hint>
                )}
              </div>
              <FindingWaiver
                scope={scope}
                findingId={finding.id}
                waived={waived}
                reason={waiverReason}
              />
            </div>
          </Collapsible.Content>
        )}
      </CorrectionDrop>
    </Collapsible.Root>
  );
}

export { FindingList } from './FindingList.js';
