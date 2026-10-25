import { RootRequirementGroup } from './RootRequirementGroup.js';
import styles from '../styles/ui.module.css';
import disclosureStyles from '../styles/disclosure.module.css';
import { TextButton } from '../ui.js';
import type { GroupReport, RequirementCounts } from '../../../core/types.js';
import { useDisclosures } from '../disclosures.js';
import { RequirementGroup } from './RequirementGroup.js';
import { useRouteStore } from '../store/route.js';

export function RequirementChecklist({
  groups,
  counts,
  dir,
  readOnly,
  highlight,
}: {
  groups: GroupReport[];
  counts: RequirementCounts;
  dir: string;
  readOnly?: boolean;
  highlight?: string;
}) {
  const [expandedGroups, setExpandedGroups] = useDisclosures(dir, 'groups');
  const navigate = useRouteStore((state) => state.navigate);
  const groupNames = [...groups.map((g) => g.group.name), '根目录'];
  return (
    <section aria-label="分组与材料">
      <div className={styles.sectionHeading}>
        <h2>分组与材料</h2>
        <div className={disclosureStyles.disclosureActions}>
          {!readOnly && (
            <TextButton onClick={() => navigate({ page: 'inbox' })}>到收件箱集中处理 →</TextButton>
          )}
          <TextButton onClick={() => setExpandedGroups(groupNames, true)}>全部展开</TextButton>
          <TextButton onClick={() => setExpandedGroups(groupNames, false)}>全部收起</TextButton>
        </div>
        <span className={styles.muted}>
          需要 {counts.total} · ✓ 已找到 {counts.found} · ? 待确认 {counts.unconfirmed} · ✗ 缺失{' '}
          {counts.missing}
        </span>
      </div>
      {!groups.some((g) => g.group.name === '根目录') && (
        <RootRequirementGroup
          highlight={highlight}
          expanded={!!expandedGroups['根目录']}
          onOpenChange={(open) => setExpandedGroups(['根目录'], open)}
        />
      )}
      {groups.map((group) => (
        <RequirementGroup
          key={group.group.id}
          group={group}
          dir={dir}
          readOnly={readOnly}
          highlight={highlight}
          expanded={expandedGroups[group.group.name] ?? false}
          onOpenChange={(open) => setExpandedGroups([group.group.name], open)}
        />
      ))}
    </section>
  );
}
