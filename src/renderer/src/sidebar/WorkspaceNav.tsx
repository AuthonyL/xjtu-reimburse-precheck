import { useInbox } from '../inbox/useInbox.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRouteStore } from '../store/route.js';
import { useStatusStore } from '../store/status.js';
import styles from './sidebar.module.css';

export function WorkspaceNav() {
  const { items, loading, error } = useInbox();
  const view = useWorkspaceStore((state) => state.view);
  const page = useRouteStore((state) => state.route.page);
  const navigate = useRouteStore((state) => state.navigate);
  const busy = useStatusStore((state) => state.busy);
  const count = view?.batches.reduce((sum, current) => sum + current.batch.invoices.length, 0) ?? 0;
  return (
    <nav className={styles.workspaceNav} aria-label="工作区页面">
      <button
        className={styles.treeNode}
        aria-current={page === 'inbox' ? 'page' : undefined}
        aria-label={'收件箱' + (!loading && !error && items.length ? ' ' + items.length : '')}
        disabled={busy}
        onClick={() => navigate({ page: 'inbox' })}
      >
        <span className={styles.treeLabel}>收件箱</span>
        {!loading && !error && items.length > 0 && (
          <span className={styles.treeBadge}>{items.length}</span>
        )}
      </button>
      <button
        className={styles.treeNode}
        aria-current={page === 'invoices' ? 'page' : undefined}
        aria-label={`发票 ${count} 张`}
        disabled={busy}
        onClick={() => navigate({ page: 'invoices' })}
      >
        <span className={styles.treeLabel}>发票</span>
        <span className={styles.treeBadge}>{count} 张</span>
      </button>
    </nav>
  );
}
