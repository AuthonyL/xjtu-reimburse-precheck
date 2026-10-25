import styles from './sidebar/sidebar.module.css';
import uiStyles from './styles/ui.module.css';
import { Hint, TextButton } from './ui.js';
import { useWorkspaceStore } from './store/workspace.js';
import { useRouteStore } from './store/route.js';
import { useStatusStore } from './store/status.js';
import { useLayoutStore } from './store/layout.js';
import { buildWorkspaceTree } from '../../shared/navigation.js';
import { nameOf } from './ui.js';
import { WorkspaceTree } from './sidebar/WorkspaceTree.js';
import { SidebarFooter } from './sidebar/SidebarFooter.js';
import { SidebarResizer } from './sidebar/SidebarResizer.js';

export function Sidebar() {
  const workspace = useWorkspaceStore((state) => state.view)!;
  const busy = useStatusStore((state) => state.busy);
  const width = useLayoutStore((state) => state.sidebarWidth);
  const select = useRouteStore((state) => state.select);
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
        <div className={styles.sidebarHeading}>
          <Hint text={workspace.dir}>
            <TextButton
              className={styles.workspaceName}

              disabled={busy}
              onClick={() => select('')}
            >
              {nameOf(workspace.dir)}
            </TextButton>
          </Hint>
          <div className={uiStyles.actions + ' ' + styles.sidebarActions}>
            <button disabled={busy} onClick={open}>
              打开其他文件夹
            </button>
            <button disabled={busy} onClick={refresh}>
              全部重新检查
            </button>
          </div>
          {busy && (
            <p className={styles.sidebarLoading} role="status">
              ◌ 正在检查…
            </p>
          )}
        </div>
        <WorkspaceTree nodes={buildWorkspaceTree(workspace)} />
        <SidebarFooter />
      </aside>
      <SidebarResizer />
    </>
  );
}
