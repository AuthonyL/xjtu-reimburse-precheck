import { useMemo, useState } from 'react';
import { Tabs } from 'radix-ui';
import type { WorkspaceView } from '../../../shared/api.js';
import { CLAIM_STATE_LABELS } from '../../../core/domain/transitions.js';
import {
  CLAIM_COLUMNS,
  REGISTRY_COLUMNS,
  claimCells,
  registryCells,
} from '../../../core/export/ledger.js';
import { ledgerClaims } from '../../../shared/ledger.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun, useStatusStore } from '../store/status.js';
import { Money } from '../ui.js';
import uiStyles from '../styles/ui.module.css';
import { useRegistry } from './useRegistry.js';
import { LedgerTable } from './LedgerTable.js';
import styles from './ledger.module.css';

export function LedgerPage() {
  const view = useWorkspaceStore((state) => state.view);
  return view ? <LedgerContent key={view.dir} view={view} /> : null;
}
function LedgerContent({ view }: { view: WorkspaceView }) {
  const claims = useMemo(() => ledgerClaims(view), [view]);
  const { registry, error, retry } = useRegistry(view);
  const [state, setState] = useState('');
  const [keyword, setKeyword] = useState('');
  const [output, setOutput] = useState('');
  const run = useRun();
  const busy = useStatusStore((state) => state.busy);
  const shown = claims.filter((row) => !state || row.claim.state === state);
  const entries =
    registry?.entries
      .map((entry) => registryCells(entry, claims))
      .filter((cells) =>
        cells.join(' ').toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase()),
      ) ?? [];
  const total = claims
    .filter((row) => row.claim.state === 'reimbursed')
    .reduce((sum, row) => sum + row.totalCny, 0);
  const exportLedger = () =>
    void run(async () => {
      const file = await window.precheck.exportLedger();
      if (useWorkspaceStore.getState().view?.dir !== view.dir) return;
      setOutput(file);
      useStatusStore.setState({ notice: '台账已导出：' + file });
    });
  return (
    <main>
      <div className={uiStyles.pageHeading}>
        <h1>台账</h1>
        <button disabled={busy} onClick={exportLedger}>
          导出台账 Markdown
        </button>
      </div>
      <div className={styles.summary} data-testid="ledger-summary">
        <p>
          {Object.entries(CLAIM_STATE_LABELS).map(([state, label]) => (
            <span key={state}>
              {label} {claims.filter((row) => row.claim.state === state).length}
            </span>
          ))}
        </p>
        <p>
          已报销 CNY 合计 ¥ <Money value={total} />
          （已知人民币金额）
        </p>
      </div>
      {output && (
        <div className={styles.output} role="status">
          <span className={uiStyles.path}>{output}</span>
          <button onClick={() => void run(() => window.precheck.revealFile(output))}>
            在文件夹中显示
          </button>
        </div>
      )}
      <Tabs.Root defaultValue="claims">
        <Tabs.List className={styles.tabs} aria-label="台账类型">
          <Tabs.Trigger value="claims">报销单</Tabs.Trigger>
          <Tabs.Trigger value="registry">发票登记簿</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="claims">
          <label className={styles.filter}>
            报销状态
            <select value={state} onChange={(event) => setState(event.target.value)}>
              <option value="">全部状态</option>
              {Object.entries(CLAIM_STATE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <LedgerTable
            title="报销单台账"
            columns={CLAIM_COLUMNS}
            rows={shown.map(claimCells)}
            dirs={shown.map((row) => row.batchDir)}
          />
          {!shown.length && <p>没有符合条件的报销单。</p>}
        </Tabs.Content>
        <Tabs.Content value="registry">
          <label className={styles.filter}>
            搜索登记簿
            <input
              type="search"
              placeholder="发票号、销方或批次"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          {error ? (
            <p role="alert">
              登记簿读取失败：{error} <button onClick={retry}>重试</button>
            </p>
          ) : !registry ? (
            <p role="status">正在读取登记簿…</p>
          ) : (
            <>
              <LedgerTable title="发票登记簿" columns={REGISTRY_COLUMNS} rows={entries} />
              {!entries.length && <p>没有符合条件的登记记录。</p>}
            </>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </main>
  );
}
