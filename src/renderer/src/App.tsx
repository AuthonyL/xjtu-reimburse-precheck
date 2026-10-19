import { useEffect, useRef, useState } from 'react';
import type { AppSettings, Bootstrap, SidebarLayout, WorkspaceView } from '../../shared/api.js';
import { SIDEBAR_DEFAULT, groupAnchor, laborAnchor } from '../../shared/navigation.js';
import { DisclosureProvider, reconcileDisclosures, type DisclosureState } from './disclosures.js';
import { LaborPage } from './LaborPage.js';
import { RejectedPage } from './RejectedPage.js';
import { Results } from './Results.js';
import { RuleHelpProvider } from './RuleHelp.js';
import type { RuleFocus } from './RulesOverview.js';
import { FeedbackProvider } from './Feedback.js';
import { RuleVersion } from './RuleVersion.js';
import { CorrectionNoticeProvider } from './CorrectionNotice.js';
import { Settings } from './Settings.js';
import { Sidebar } from './Sidebar.js';
import { Home } from './Home.js';
import { Overview } from './Overview.js';
import { nameOf, type Run } from './ui.js';

export function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null);
  const [disclosures, setDisclosures] = useState<DisclosureState>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<{ group: string; revision: number } | null>(null);
  const [highlight, setHighlight] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ruleFocus, setRuleFocus] = useState<RuleFocus | null>(null);
  const openRules = (id?: string) => {
    setRuleFocus({ id: id ?? '', revision: performance.now() });
    setSettingsOpen(true);
  };
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [layout, setLayout] = useState<SidebarLayout>({
    sidebarWidth: SIDEBAR_DEFAULT,
    sidebarCollapsed: false,
  });
  const pane = useRef<HTMLDivElement>(null);
  const bootstrap = useRef<Promise<Bootstrap> | null>(null);
  const run: Run = async (action, success) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (success) setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const saveLayout = (patch: Partial<SidebarLayout>) => {
    setLayout((old) => ({ ...old, ...patch }));
    void window.precheck.saveLayout(patch).catch((e: unknown) => setError(String(e)));
  };
  const toggleSidebar = () => saveLayout({ sidebarCollapsed: !layout.sidebarCollapsed });
  useEffect(() => {
    let active = true;
    bootstrap.current ??= window.precheck.bootstrap();
    void bootstrap.current
      .then((value) => {
        if (!active) return;
        setBoot(value);
        if (value.session) setLayout(value.session);
        if (value.restored?.workspace) {
          setWorkspace(value.restored.workspace);
          setSelected(value.restored.workspace.selectedBatchDir);
        }
        if (value.restored?.message) setNotice(value.restored.message);
      })
      .catch((e: unknown) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    const unsubscribe = window.precheck.onEvent((event) => {
      if (event.type === 'rates-saved') {
        setWorkspace(event.workspace);
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
  }, [selected, settingsOpen]);
  useEffect(() => {
    if (!target || settingsOpen) {
      setHighlight('');
      return;
    }
    (
      document.getElementById(groupAnchor(target.group)) ??
      document.getElementById(laborAnchor(target.group))
    )?.scrollIntoView?.({ block: 'start' });
    setHighlight(target.group);
    const timer = window.setTimeout(() => setHighlight(''), 1800);
    return () => window.clearTimeout(timer);
  }, [target, selected, settingsOpen]);
  const opened = (view: WorkspaceView | null) => {
    if (!view) return;
    setWorkspace(view);
    setSelected(view.selectedBatchDir);
    setTarget(null);
    setSettingsOpen(false);
    setBoot((old) =>
      old
        ? {
            ...old,
            recent: [view.openedDir, ...old.recent.filter((d) => d !== view.openedDir)].slice(
              0,
              10,
            ),
          }
        : old,
    );
  };
  useEffect(() => {
    if (workspace) setDisclosures((old) => reconcileDisclosures(old, workspace));
  }, [workspace]);
  const select = (dir: string, group?: string) => {
    const batchDir = dir || null;
    if (group && batchDir)
      setDisclosures((old) => ({
        ...old,
        [batchDir]: { ...old[batchDir], groups: { ...old[batchDir]?.groups, [group]: true } },
      }));
    setSelected(batchDir);
    setSettingsOpen(false);
    setTarget(group ? { group, revision: performance.now() } : null);
    setWorkspace((old) => (old ? { ...old, selectedBatchDir: batchDir } : null));
    void window.precheck.selectBatch(batchDir).catch((e: unknown) => setError(String(e)));
  };
  const choose = () => void run(async () => opened(await window.precheck.chooseFolder()));
  const refresh = () => void run(async () => setWorkspace(await window.precheck.recheck()));
  const changeSettings = async (settings: AppSettings) => {
    setBoot((old) => (old ? { ...old, settings } : null));
    if (window.precheck.ruleVersion) {
      const version = await window.precheck.ruleVersion();
      setBoot((old) => (old ? { ...old, ruleVersion: version } : old));
    }
    if (workspace) setWorkspace(await window.precheck.recheck());
  };
  const current =
    workspace?.batches.find((b) => b.batch.dir === selected) ??
    (workspace?.rejected?.batch.dir === selected ? workspace.rejected : undefined);
  const currentLabor = workspace?.labor?.find((l) => l.report.dir === selected);
  return (
    <DisclosureProvider state={disclosures} setState={setDisclosures}>
      <CorrectionNoticeProvider run={run} update={setWorkspace} busy={busy}>
        <FeedbackProvider revision={workspace} run={run}>
          <RuleHelpProvider rules={boot?.settings.rules} openRule={(id) => openRules(id)}>
            <div
              className={'app' + (dragging ? ' dragging' : '')}
              onDropCapture={() => setDragging(false)}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (!busy && file)
                  void run(async () => opened(await window.precheck.droppedFolder(file)));
              }}
            >
              <header className="app-header">
                <div className="header-title">
                  {workspace && (
                    <button
                      aria-label={
                        (layout.sidebarCollapsed ? '展开' : '收起') + '侧栏（Cmd/Ctrl+B）'
                      }
                      aria-expanded={!layout.sidebarCollapsed}
                      onClick={toggleSidebar}
                    >
                      ☰
                    </button>
                  )}
                  <span className="brand">
                    报销预检<span>课题组票据核对</span>
                  </span>
                  {workspace && (
                    <span className="header-workspace muted">{nameOf(workspace.dir)}</span>
                  )}
                </div>
                {!workspace && (
                  <button disabled={busy || !boot} onClick={() => setSettingsOpen(!settingsOpen)}>
                    {settingsOpen ? '返回首页' : '⚙ 设置'}
                  </button>
                )}
              </header>
              {!settingsOpen && boot?.ruleVersion?.upgrade && (
                <RuleVersion
                  version={boot.ruleVersion}
                  settings={boot.settings}
                  rulesChanged={changeSettings}
                  run={run}
                />
              )}
              {error && (
                <div role="alert" className="message error">
                  {error}
                  <button className="text-button" onClick={() => setError('')}>
                    关闭
                  </button>
                </div>
              )}
              {notice && (
                <div role="status" className="message notice">
                  {notice}
                  <button className="text-button" onClick={() => setNotice('')}>
                    关闭
                  </button>
                </div>
              )}
              {!boot && error && (
                <button
                  onClick={() =>
                    void run(async () => {
                      await window.precheck.resetSettings();
                      bootstrap.current = null;
                      const value = await window.precheck.bootstrap();
                      setBoot(value);
                      if (value.session) setLayout(value.session);
                      if (value.restored.workspace) opened(value.restored.workspace);
                    })
                  }
                >
                  恢复默认设置
                </button>
              )}
              <div className="app-body">
                {workspace && !layout.sidebarCollapsed && (
                  <Sidebar
                    key={workspace.dir}
                    workspace={workspace}
                    selected={selected}
                    selectedGroup={target?.group}
                    selectionRevision={target?.revision}
                    settingsOpen={settingsOpen}
                    busy={busy}
                    width={layout.sidebarWidth}
                    select={select}
                    open={choose}
                    refresh={refresh}
                    settings={() => {
                      setRuleFocus(null);
                      setSettingsOpen(true);
                    }}
                    resize={(sidebarWidth) => setLayout((old) => ({ ...old, sidebarWidth }))}
                    resized={(sidebarWidth) => saveLayout({ sidebarWidth })}
                  />
                )}
                <div className="result-pane" ref={pane} aria-busy={busy} data-testid="result-pane">
                  {busy && (
                    <div className="busy" role="status">
                      ◌ 正在检查，请稍候…
                    </div>
                  )}
                  <fieldset className="workspace" disabled={busy}>
                    {settingsOpen && boot ? (
                      <Settings
                        initial={boot.settings}
                        userData={boot.userData}
                        run={run}
                        changed={changeSettings}
                        focusRule={ruleFocus}
                        version={boot.ruleVersion}
                      />
                    ) : !workspace ? (
                      <Home
                        recent={boot?.recent ?? []}
                        choose={choose}
                        open={(dir) =>
                          void run(async () => opened(await window.precheck.openFolder(dir)))
                        }
                      />
                    ) : currentLabor && boot ? (
                      <LaborPage
                        key={currentLabor.report.dir}
                        view={currentLabor}
                        config={boot.settings.rules}
                        run={run}
                        update={setWorkspace}
                        highlight={highlight}
                      />
                    ) : current?.readOnly ? (
                      <RejectedPage view={current} run={run} update={setWorkspace} />
                    ) : current ? (
                      <Results
                        key={current.batch.dir}
                        view={current}
                        run={run}
                        settings={boot?.settings}
                        update={setWorkspace}
                        back={() => select('')}
                        highlight={highlight}
                        locate={(group) => select(current.batch.dir, group)}
                      />
                    ) : (
                      <Overview view={workspace} select={select} refresh={refresh} />
                    )}
                  </fieldset>
                </div>
              </div>
              {dragging && <div className="drop-overlay">松开以检查此文件夹</div>}
            </div>
          </RuleHelpProvider>
        </FeedbackProvider>
      </CorrectionNoticeProvider>
    </DisclosureProvider>
  );
}
