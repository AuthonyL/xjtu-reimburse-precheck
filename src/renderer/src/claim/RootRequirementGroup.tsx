import styles from '../styles/ui.module.css';
import disclosureStyles from '../styles/disclosure.module.css';
import localStyles from './claim.module.css';
import { Collapsible } from 'radix-ui';
import { groupAnchor } from '../../../shared/navigation.js';

export function RootRequirementGroup({
  highlight,
  expanded,
  onOpenChange,
}: {
  highlight?: string;
  expanded: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible.Root asChild open={expanded} onOpenChange={onOpenChange}>
      <article
        id={groupAnchor('根目录')}
        data-testid="group-根目录"
        className={
          localStyles.groupCard +
          ' ' +
          styles.panel +
          ' ' +
          localStyles.groupSurface +
          (highlight === '根目录' ? ' ' + 'group-highlight' : '')
        }
      >
        <Collapsible.Trigger asChild>
          <button
            className={disclosureStyles.groupSummary}
            aria-expanded={expanded}
            aria-controls={groupAnchor('根目录') + '-details'}
          >
            <span className={disclosureStyles.groupName}>根目录</span>
            <span className={disclosureStyles.groupMaterialCounts}>✓ 0 · ? 0 · ✗ 0</span>
            <span className={disclosureStyles.disclosureChevron}>{expanded ? '▾' : '▸'}</span>
          </button>
        </Collapsible.Trigger>
        {expanded && (
          <Collapsible.Content asChild>
            <p id={groupAnchor('根目录') + '-details'} className={styles.muted}>
              本批次没有根目录散票。
            </p>
          </Collapsible.Content>
        )}
      </article>
    </Collapsible.Root>
  );
}
