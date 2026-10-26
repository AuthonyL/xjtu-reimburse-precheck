import styles from './sidebar/sidebar.module.css';
import { useWorkspaceStore } from './store/workspace.js';
import { useStatusStore } from './store/status.js';
import { useLayoutStore } from './store/layout.js';
import { buildWorkspaceTree } from '../../shared/navigation.js';
import { WorkspaceTree } from './sidebar/WorkspaceTree.js';
import { SidebarFooter } from './sidebar/SidebarFooter.js';
import { SidebarResizer } from './sidebar/SidebarResizer.js';
import { WorkspaceNav } from './sidebar/WorkspaceNav.js';

export function Sidebar() {
  const workspace = useWorkspaceStore((state) => state.view)!;
  const busy = useStatusStore((state) => state.busy);
  const width = useLayoutStore((state) => state.sidebarWidth);
  const open = useWorkspaceStore((state) => state.choose);
  const refresh = useWorkspaceStore((state) => state.refresh);
  return (
    <>
      <aside
        className={styles.sidebar}
        style={{ width: `min(${width}px, calc(100vw - 550px))` }}
        aria-label="工作区侧栏"
        aria-busy={busy}
      >
        <WorkspaceNav />
        <section className={styles.batchSection} aria-labelledby="sidebar-batches">
          <div className={styles.batchHeading}>
            <h2 id="sidebar-batches">批次</h2>
            <div className={styles.sidebarActions}>
              <button disabled={busy} onClick={open}>
                <span aria-hidden="true">↗</span> 打开其他文件夹
              </button>
              <button disabled={busy} onClick={refresh}>
                <span aria-hidden="true">↻</span> 全部重新检查
              </button>
            </div>
          </div>
          <WorkspaceTree nodes={buildWorkspaceTree(workspace)} />
        </section>
        <SidebarFooter />
      </aside>
      <SidebarResizer />
    </>
  );
}
