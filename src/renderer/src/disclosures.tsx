import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { Finding } from '../../core/types.js';
import type { WorkspaceView } from '../../shared/api.js';
import { problemKey } from '../../core/correction/problems.js';

// dup 的多条来源共用 core 问题键；显示子键区分来源，不改变检测目标的键。
export function findingDisclosureKey(finding: Finding, scope: string): string {
  const key = problemKey(finding, scope);
  if (finding.ruleId !== 'dup' || finding.code) return key;
  const batch =
    finding.message.match(/^与其他批次 (.+) 重复$/)?.[1] ??
    finding.message.match(/^与(.+)重复：已在 /)?.[1];
  const source = batch
    ? 'batch:' + batch
    : finding.message.includes('已提交历史')
      ? 'history'
      : finding.message.includes('同一批次')
        ? 'within'
        : finding.message;
  return key + ':' + JSON.stringify(source);
}

type Entries = Record<string, boolean>;
export type DisclosureState = Record<
  string,
  { findings?: Entries; groups?: Entries; sections?: Entries }
>;
interface DisclosureStore {
  state: DisclosureState;
  setState: Dispatch<SetStateAction<DisclosureState>>;
}
const Context = createContext<DisclosureStore | null>(null);
export function DisclosureProvider({
  state,
  setState,
  children,
}: DisclosureStore & { children: ReactNode }) {
  return <Context.Provider value={{ state, setState }}>{children}</Context.Provider>;
}

export function useDisclosures(scope: string, kind: 'findings' | 'groups' | 'sections') {
  const store = useContext(Context);
  const [local, setLocal] = useState<Entries>({});
  const entries = store?.state[scope]?.[kind] ?? local;
  const set = (keys: string[], open: boolean) => {
    const patch = Object.fromEntries(keys.map((key) => [key, open]));
    if (store)
      store.setState((old) => ({
        ...old,
        [scope]: { ...old[scope], [kind]: { ...old[scope]?.[kind], ...patch } },
      }));
    else setLocal((old) => ({ ...old, ...patch }));
  };
  return [entries, set] as const;
}

// 未显示的目录也保留会话状态；当前工作区中已解决的问题清除旧键。
export function reconcileDisclosures(
  state: DisclosureState,
  workspace: WorkspaceView,
): DisclosureState {
  const next = { ...state };
  const prune = (dir: string, findings: string[], groups: string[] = []) => {
    if (!state[dir]) return;
    const allowed = { findings: new Set(findings), groups: new Set(groups) };
    next[dir] = { ...state[dir] };
    for (const kind of ['findings', 'groups'] as const) {
      next[dir][kind] = Object.fromEntries(
        Object.entries(state[dir]?.[kind] ?? {}).filter(([key]) => allowed[kind].has(key)),
      );
    }
  };
  for (const view of workspace.batches) {
    const dir = view.batch.dir;
    prune(
      dir,
      view.report.findings.map((f) => findingDisclosureKey(f, dir)),
      [...view.report.groups.map((g) => g.group.name), '根目录'],
    );
    const groups = { ...next[dir]?.groups };
    for (const g of view.report.groups) {
      groups[g.group.name] ??= false;
    }
    groups['根目录'] ??= false;
    next[dir] = { ...next[dir], groups };
  }
  for (const { report } of workspace.labor ?? []) {
    prune(
      report.dir,
      [...report.diagnostics, ...report.entries.flatMap((e) => e.findings)].map((f) =>
        findingDisclosureKey(f, report.dir),
      ),
    );
  }
  return JSON.stringify(next) === JSON.stringify(state) ? state : next;
}
