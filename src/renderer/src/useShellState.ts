import { useEffect, useRef, useState } from 'react';
import type { Bootstrap } from '../../shared/api.js';
import { groupAnchor, laborAnchor } from '../../shared/navigation.js';
import { reconcileDisclosures, type DisclosureState } from './disclosures.js';
import { nameOf } from './ui.js';
import { useWorkspaceStore } from './store/workspace.js';
import { routeForDir, useRouteStore } from './store/route.js';
import { useRun, useStatusStore } from './store/status.js';
import { useLayoutStore } from './store/layout.js';

function restore(value: Bootstrap) {
  useWorkspaceStore.setState({ boot: value, view: value.restored?.workspace ?? null });
  if (value.session)
    useLayoutStore.setState({
      sidebarWidth: value.session.sidebarWidth,
      sidebarCollapsed: value.session.sidebarCollapsed,
    });
  const view = value.restored?.workspace ?? null;
  useRouteStore.setState({ route: routeForDir(view, view?.selectedBatchDir ?? null) });
}
export function useShellState() {
  const boot = useWorkspaceStore((state) => state.boot);
  const workspace = useWorkspaceStore((state) => state.view);
  const opened = useWorkspaceStore((state) => state.opened);
  const route = useRouteStore((state) => state.route);
  const revision = useRouteStore((state) => state.revision);
  const navigate = useRouteStore((state) => state.navigate);
  const selected = route.dir ?? null;
  const settingsOpen = route.page === 'rules';
  const { busy, error, notice } = useStatusStore();
  const run = useRun();
  const setError = (error: string) => useStatusStore.setState({ error });
  const setNotice = (notice: string) => useStatusStore.setState({ notice });
  const setBusy = (busy: boolean) => useStatusStore.setState({ busy });
  const layout = useLayoutStore();
  const dragging = layout.dragging;
  const setDragging = (dragging: boolean) => useLayoutStore.setState({ dragging });
  const toggleSidebar = () =>
    void layout.saveLayout({ sidebarCollapsed: !layout.sidebarCollapsed });
  const [disclosures, setDisclosures] = useState<DisclosureState>({});
  const pane = useRef<HTMLDivElement>(null);
  const lastScrolled = useRef<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const bootstrap = useRef<Promise<Bootstrap> | null>(null);
  useEffect(() => {
    let active = true;
    bootstrap.current ??= window.precheck.bootstrap();
    void bootstrap.current
      .then((value) => {
        if (!active) return;
        restore(value);
        if (value.restored?.message) setNotice(value.restored.message);
      })
      .catch((error: unknown) => {
        if (active) setError(String(error));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    const unsubscribe = window.precheck.onEvent((event) => {
      if (event.type === 'rates-saved') {
        useWorkspaceStore.getState().setView(event.workspace);
        setNotice('汇率和红圈截图已保存：' + nameOf(event.file));
      } else setError(event.message);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (workspace && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [workspace, layout.sidebarCollapsed]);
  useEffect(() => {
    if (pane.current) pane.current.scrollTop = 0;
  }, [selected, route.page]);
  useEffect(() => {
    if (workspace) setDisclosures((old) => reconcileDisclosures(old, workspace));
  }, [workspace]);
  useEffect(() => {
    const group = route.group;
    if (group && selected && !settingsOpen)
      setDisclosures((old) => ({
        ...old,
        [selected]: { ...old[selected], groups: { ...old[selected]?.groups, [group]: true } },
      }));
  }, [route.group, revision, selected, settingsOpen]);
  useEffect(() => {
    const group = route.group;
    if (!group || settingsOpen) {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
      useRouteStore.setState({ highlight: '' });
      return;
    }
    // Wait for the expanded group to commit before scrolling; each request scrolls only once.
    if (!selected || !disclosures[selected]?.groups?.[group] || lastScrolled.current === revision)
      return;
    (
      document.getElementById(groupAnchor(group)) ?? document.getElementById(laborAnchor(group))
    )?.scrollIntoView?.({ block: 'start' });
    lastScrolled.current = revision;
    useRouteStore.setState({ highlight: group });
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(
      () => useRouteStore.setState({ highlight: '' }),
      1800,
    );
  }, [disclosures, route.group, revision, selected, settingsOpen]);
  useEffect(
    () => () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  return {
    boot,
    workspace,
    selected,
    settingsOpen,
    busy,
    error,
    notice,
    run,
    setError,
    setNotice,
    layout: { sidebarCollapsed: layout.sidebarCollapsed },
    dragging,
    setDragging,
    toggleSidebar,
    pane,
    disclosures,
    setDisclosures,
    bootstrap,
    opened,
    navigate,
    restore,
  };
}
