import type { AttachmentType, InboxItem } from '../../../core/types.js';
import { FileLink, materialNames, nameOf, Pill, TextButton } from '../ui.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRouteStore } from '../store/route.js';
import { useRun, useStatusStore } from '../store/status.js';
import styles from './inbox.module.css';

const kindLabels = { unidentified: '未识别', unnamed: '未命名附件', parseFailed: '解析失败' };

export function InboxItemRow({ item }: { item: InboxItem }) {
  const run = useRun();
  const busy = useStatusStore((state) => state.busy);
  const apply = useWorkspaceStore((state) => state.apply);
  const select = useRouteStore((state) => state.select);
  const classify = (type: AttachmentType) =>
    void run(
      () => apply(() => window.precheck.confirmAttachment(item.batchDir, item.relativePath, type)),
      '已标记为' + materialNames[type],
    );
  const suggestions = item.suggestions.length
    ? item.suggestions
    : item.kind === 'unnamed'
      ? ['payment' as const]
      : [];
  return (
    <article className={styles.item} aria-label={nameOf(item.path)}>
      <div className={styles.file}>
        <FileLink file={item.path} />
        <span>{item.group}</span>
        <Pill tone={item.kind === 'parseFailed' ? 'warning' : 'neutral'}>
          {kindLabels[item.kind]}
        </Pill>
      </div>
      <div className={styles.actions}>
        {suggestions.slice(0, 3).map((type) => (
          <button key={type} disabled={busy} onClick={() => classify(type)}>
            是{materialNames[type]}
          </button>
        ))}
        <select
          aria-label={'其他类型 ' + nameOf(item.path)}
          disabled={busy}
          value=""
          onChange={(event) => {
            if (event.target.value) classify(event.target.value as AttachmentType);
          }}
        >
          <option value="">其他类型…</option>
          {(Object.entries(materialNames) as [AttachmentType, string][]).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <TextButton disabled={busy} onClick={() => select(item.batchDir, item.group)}>
          是收据，去手填
        </TextButton>
        <TextButton
          disabled={busy}
          onClick={() =>
            void run(
              () => apply(() => window.precheck.ignoreFile(item.batchDir, item.relativePath)),
              '已忽略文件',
            )
          }
        >
          忽略
        </TextButton>
      </div>
    </article>
  );
}
