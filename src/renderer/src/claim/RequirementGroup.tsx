import styles from './claim.module.css';
import uiStyles from '../styles/ui.module.css';
import disclosureStyles from '../styles/disclosure.module.css';
import { Hint, Pill, Money } from '../ui.js';
import { Collapsible } from 'radix-ui';
import type { GroupReport } from '../../../core/types.js';
import { groupAnchor } from '../../../shared/navigation.js';
import { money } from '../ui.js';
import { RequirementRow } from './RequirementRow.js';

export function RequirementGroup({
  group: g,
  dir,
  readOnly,
  highlight,
  expanded,
  onOpenChange,
}: {
  group: GroupReport;
  dir: string;
  readOnly?: boolean;
  highlight?: string;
  expanded: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const counts = { found: 0, unconfirmed: 0, missing: 0 };
  g.requirements.forEach((r) => counts[r.status]++);
  const detailsId = groupAnchor(g.group.name) + '-details';
  return (
    <Collapsible.Root asChild open={expanded} onOpenChange={onOpenChange}>
      <article
        className={
          styles.groupCard +
          ' ' +
          uiStyles.panel +
          ' ' +
          styles.groupSurface +
          (highlight === g.group.name ? ' ' + 'group-highlight' : '')
        }
        id={groupAnchor(g.group.name)}
        data-testid={'group-' + g.group.name}
      >
        <Collapsible.Trigger asChild>
          <button
            className={disclosureStyles.groupSummary}
            aria-expanded={expanded}
            aria-controls={detailsId}
          >
            <Hint text={g.group.name}>
              <span className={disclosureStyles.groupName}>{g.group.name}</span>
            </Hint>
            <span
              className={uiStyles.tags + ' ' + disclosureStyles.groupTags + ' ' + styles.groupFlags}
            >
              {Object.entries(g.group.flags)
                .filter(([, value]) => value)
                .map(([key]) => (
                  <Pill key={key}>
                    {
                      {
                        deferred: '暂缓',
                        bankTransfer: '公转',
                        outsourced: '委托',
                        ai: 'AI',
                      }[key]
                    }
                  </Pill>
                ))}
            </span>
            <Hint text={g.expenseContent}>
              <span className={disclosureStyles.groupExpense}>{g.expenseContent}</span>
            </Hint>
            <span className={disclosureStyles.groupTotal}>
              ¥ <Money value={g.totalCny} />
              {g.unconverted.length ? ` + ${g.unconverted.length} 张未折算` : ''}
            </span>
            <Hint text="已找到 · 待确认 · 缺失">
              <span className={disclosureStyles.groupMaterialCounts}>
                ✓ {counts.found} · ? {counts.unconfirmed} · ✗ {counts.missing}
              </span>
            </Hint>
            <span className={disclosureStyles.disclosureChevron} aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
          </button>
        </Collapsible.Trigger>
        {expanded && (
          <Collapsible.Content asChild>
            <div id={detailsId} className={styles.groupDetails}>
              {g.requirements.length ? (
                g.requirements.map((requirement) => (
                  <RequirementRow
                    key={requirement.id}
                    requirement={requirement}
                    groupId={g.group.id}
                    dir={dir}
                    readOnly={readOnly}
                  />
                ))
              ) : (
                <p className={uiStyles.muted}>此组未触发材料要求。</p>
              )}
            </div>
          </Collapsible.Content>
        )}
      </article>
    </Collapsible.Root>
  );
}
