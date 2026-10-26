import styles from './styles/shell.module.css';
import uiStyles from './styles/ui.module.css';
import { DisclosureProvider } from './disclosures.js';
import { RuleHelpProvider } from './RuleHelp.js';
import { FeedbackProvider } from './Feedback.js';
import { RuleVersion } from './RuleVersion.js';
import { CorrectionNoticeProvider } from './CorrectionNotice.js';
import { Sidebar } from './Sidebar.js';
import { TextButton } from './ui.js';
import type { ReactNode } from 'react';
import { routeForDir } from './store/route.js';
import { useShellState } from './useShellState.js';

export function Shell({ children }: { children: ReactNode }) {
  const {
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
    layout,
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
  } = useShellState();
  return (
    <DisclosureProvider state={disclosures} setState={setDisclosures}>
      <CorrectionNoticeProvider>
        <FeedbackProvider>
          <RuleHelpProvider rules={boot?.settings.rules}>
            <div
              className={styles.app + (dragging ? ' ' + styles.dragging : '')}
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
              <header className={styles.appHeader}>
                <div className={styles.headerTitle}>
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
                  <span className={styles.brand}>报销预检</span>
                  {workspace && (
                    <TextButton
                      className={
                        styles.headerWorkspace + ' ' + styles.workspacePath + ' ' + uiStyles.path
                      }
                      aria-label="在文件夹中显示当前工作区"
                      disabled={busy}
                      onClick={() => void run(() => window.precheck.revealFile(workspace.dir))}
                    >
                      {workspace.dir}
                    </TextButton>
                  )}
                </div>
                <div className={styles.headerStatus}>
                  {error && (
                    <div role="alert" className={styles.message + ' error'}>
                      {error}
                      <TextButton onClick={() => setError('')}>关闭</TextButton>
                    </div>
                  )}
                  {(busy || notice) && (
                    <div role="status" className={styles.message + ' ' + styles.notice}>
                      {busy ? '◌ 正在检查，请稍候…' : notice}
                      {!busy && <TextButton onClick={() => setNotice('')}>关闭</TextButton>}
                    </div>
                  )}
                  {!workspace && (
                    <button
                      disabled={busy || !boot}
                      onClick={() =>
                        navigate(
                          settingsOpen ? routeForDir(workspace, selected) : { page: 'rules' },
                        )
                      }
                    >
                      {settingsOpen ? '返回首页' : '⚙ 设置'}
                    </button>
                  )}
                </div>
              </header>
              {!settingsOpen && boot?.ruleVersion?.upgrade && (
                <RuleVersion version={boot.ruleVersion} settings={boot.settings} />
              )}
              {!boot && error && (
                <button
                  onClick={() =>
                    void run(async () => {
                      await window.precheck.resetSettings();
                      bootstrap.current = null;
                      const value = await window.precheck.bootstrap();
                      restore(value);
                      if (value.restored.workspace) opened(value.restored.workspace);
                    })
                  }
                >
                  恢复默认设置
                </button>
              )}
              <div className={styles.appBody}>
                {workspace && !layout.sidebarCollapsed && <Sidebar key={workspace.dir} />}
                <div
                  className={styles.resultPane}
                  ref={pane}
                  aria-busy={busy}
                  data-testid="result-pane"
                >
                  <fieldset className={styles.workspace} disabled={busy}>
                    {children}
                  </fieldset>
                </div>
              </div>
              {dragging && <div className={styles.dropOverlay}>松开以检查此文件夹</div>}
            </div>
          </RuleHelpProvider>
        </FeedbackProvider>
      </CorrectionNoticeProvider>
    </DisclosureProvider>
  );
}
