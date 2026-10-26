import { useWorkspaceStore } from '../store/workspace.js';
import { useStatusStore } from '../store/status.js';
import { nameOf, PageHeader } from '../ui.js';
import { useInbox } from './useInbox.js';
import { InboxItemRow } from './InboxItemRow.js';
import type { InboxItem } from '../../../core/types.js';
import styles from './inbox.module.css';

export function InboxPage() {
  const { items, error, loading } = useInbox();
  const refresh = useWorkspaceStore((state) => state.refresh);
  const busy = useStatusStore((state) => state.busy);
  const groups = new Map<string, InboxItem[]>();
  for (const item of items) {
    const group = groups.get(item.batchDir) ?? [];
    group.push(item);
    groups.set(item.batchDir, group);
  }
  return (
    <main className={styles.page}>
      <PageHeader
        title="收件箱"
        subtitle={loading ? '正在读取…' : error ? '读取失败' : `待处理 ${items.length} 个文件`}
        actions={
          <button disabled={busy || loading} onClick={refresh}>
            全部重新检查
          </button>
        }
      />
      {error ? (
        <p role="alert">{error}</p>
      ) : loading ? (
        <p role="status">正在读取收件箱…</p>
      ) : !items.length ? (
        <p className={styles.empty}>收件箱是空的：所有文件都已识别。</p>
      ) : (
        [...groups].map(([dir, files]) => (
          <section key={dir} aria-label={'批次 ' + nameOf(dir)}>
            <h2>{nameOf(dir)}</h2>
            <div className={styles.list}>
              {files.map((item) => (
                <InboxItemRow key={item.relativePath} item={item} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
