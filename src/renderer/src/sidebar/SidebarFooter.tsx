import styles from './sidebar.module.css';
import { useRouteStore } from '../store/route.js';
import { useStatusStore } from '../store/status.js';

export function SidebarFooter() {
  const settingsOpen = useRouteStore((state) => state.route.page === 'rules');
  const busy = useStatusStore((state) => state.busy);
  return (
    <div className={styles.sidebarFooter}>
      <button
        aria-pressed={settingsOpen}
        onClick={() => useRouteStore.getState().navigate({ page: 'rules' })}
        disabled={busy}
      >
        <span aria-hidden="true">⚙</span> 设置
      </button>
    </div>
  );
}
