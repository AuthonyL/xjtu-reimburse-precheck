import styles from './styles/home.module.css';
import uiStyles from './styles/ui.module.css';
import { useWorkspaceStore } from './store/workspace.js';
import { useRun } from './store/status.js';
import { useState } from 'react';
import { nameOf } from './ui.js';

export function Home() {
  const recent = useWorkspaceStore((state) => state.boot?.recent) ?? [];
  const choose = useWorkspaceStore((state) => state.choose);
  const opened = useWorkspaceStore((state) => state.opened);
  const run = useRun();
  const open = (dir: string) => void run(async () => opened(await window.precheck.openFolder(dir)));
  const [folder, setFolder] = useState('');
  return (
    <main className={styles.home}>
      <div className={styles.eyebrow}>批次检查 · 材料核对 · 清单导出</div>
      <h1>把一批发票，整理成可核对的清单。</h1>
      <p>选择日期批次或包含多个批次的根目录。也可以把文件夹拖到此窗口。</p>
      <button className={uiStyles.primary + ' ' + uiStyles.large} onClick={() => choose()}>
        选择文件夹
      </button>
      <form
        className={styles.pathForm}
        onSubmit={(e) => {
          e.preventDefault();
          open(folder);
        }}
      >
        <label htmlFor="folder-path">文件夹路径</label>
        <div className={uiStyles.inline + ' ' + styles.pathInput}>
          <input
            id="folder-path"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="粘贴完整文件夹路径"
            required
          />
          <button type="submit">打开路径</button>
        </div>
      </form>
      <section className={styles.recent}>
        <h2>最近打开</h2>
        {recent.length ? (
          recent.map((dir) => (
            <button className={styles.recentItem} key={dir} onClick={() => open(dir)}>
              <strong>{nameOf(dir)}</strong>
              <span>{dir}</span>
              <span aria-hidden>→</span>
            </button>
          ))
        ) : (
          <p className={uiStyles.muted}>打开过的文件夹会保存在本机。</p>
        )}
      </section>
    </main>
  );
}
