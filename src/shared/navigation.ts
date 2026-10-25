import { compareBatches } from '../core/batch-order.js';
import { countSeverities } from '../core/report.js';
import type { BatchView, WorkspaceView, LaborView } from './api.js';
import type { Requirement } from '../core/types.js';

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 280;

export function clampSidebarWidth(width: number): number {
  return Number.isFinite(width)
    ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)))
    : SIDEBAR_DEFAULT;
}

export interface GroupNode {
  id: string;
  label: string;
  batchDir: string;
  status: Requirement['status'];
  kind?: 'group' | 'labor' | 'statement';
  target?: string;
  errors?: number;
  children?: GroupNode[];
  tooltip?: string;
}
export interface BatchNode {
  kind?: 'batch' | 'labor';
  id: string;
  label: string;
  batchDir: string;
  errors: number;
  warnings: number;
  submitted: boolean;
  readOnly: boolean;
  children: GroupNode[];
}
function laborNode(view: LaborView): BatchNode {
  const { report } = view;
  const findings = [...report.diagnostics, ...report.entries.flatMap((e) => e.findings)];
  const counts = countSeverities(findings);
  return {
    kind: 'labor',
    id: report.dir,
    label: report.name,
    batchDir: report.dir,
    errors: counts.error,
    warnings: counts.warning,
    readOnly: false,
    submitted: false,
    children: report.entries.map((e) => {
      const counts = countSeverities(e.findings);
      return {
        id: report.dir + ':' + e.relativePath,
        label:
          (e.fields.name ?? e.relativePath.split('/').at(-1)!) +
          (e.otherVersions?.length
            ? ' · ' + e.relativePath.split('/').at(-1) + '（另一版本）'
            : ''),
        tooltip: e.otherVersions?.length
          ? `本文件：${e.relativePath}；另一版本：${e.otherVersions.join('、')}`
          : e.relativePath,
        batchDir: report.dir,
        target: e.relativePath,
        kind: 'statement',
        errors: counts.error,
        status: counts.error ? 'missing' : counts.warning ? 'unconfirmed' : 'found',
      };
    }),
  };
}

function batchNode(view: BatchView): BatchNode {
  const { batch, report } = view;
  const counts = countSeverities(report.findings);
  const children: GroupNode[] = report.groups.map((g) => ({
    id: batch.dir + ':' + g.group.name,
    label: g.group.name,
    batchDir: batch.dir,
    status: g.requirements.some((r) => r.status === 'missing')
      ? 'missing'
      : g.requirements.some((r) => r.status === 'unconfirmed')
        ? 'unconfirmed'
        : 'found',
  }));
  if (!children.some((g) => g.label === '根目录'))
    children.push({
      id: batch.dir + ':根目录',
      label: '根目录',
      batchDir: batch.dir,
      status: 'found',
    });
  children.sort((a, b) =>
    a.label === '根目录' ? -1 : b.label === '根目录' ? 1 : a.label.localeCompare(b.label, 'zh-CN'),
  );
  return {
    id: batch.dir,
    label: batch.id,
    batchDir: batch.dir,
    errors: counts.error,
    warnings: counts.warning,
    submitted: batch.submitted,
    readOnly: !!view.readOnly,
    children,
  };
}

export function buildWorkspaceTree(view: WorkspaceView): BatchNode[] {
  const batches = [...view.batches].sort((a, b) => compareBatches(a.batch, b.batch)).map(batchNode);
  for (const labor of view.labor ?? []) {
    const node = laborNode(labor);
    const parent = batches.find((b) =>
      node.batchDir.replaceAll('\\', '/').startsWith(b.batchDir.replaceAll('\\', '/') + '/'),
    );
    if (parent)
      parent.children.push({
        id: node.id,
        label: node.label,
        batchDir: node.batchDir,
        status: node.errors ? 'missing' : node.warnings ? 'unconfirmed' : 'found',
        kind: 'labor',
        errors: node.errors,
        children: node.children,
      });
    else batches.push(node);
  }
  if (view.rejected) batches.push(batchNode(view.rejected));
  return batches;
}

export const groupAnchor = (name: string) => 'group-card-' + encodeURIComponent(name);
export const laborAnchor = (file: string) => 'labor-card-' + encodeURIComponent(file);

export interface NavigationNode {
  id: string;
  batchDir: string;
  children?: readonly NavigationNode[];
}

export function expandExclusive(
  expanded: ReadonlySet<string>,
  id: string,
  tree: readonly NavigationNode[],
): Set<string> {
  const next = new Set(expanded);
  const removeBranch = (node: NavigationNode) => {
    next.delete(node.id);
    node.children?.forEach(removeBranch);
  };
  const visit = (siblings: readonly NavigationNode[]): boolean => {
    if (siblings.some((node) => node.id === id)) {
      siblings.filter((node) => node.id !== id).forEach(removeBranch);
      next.add(id);
      return true;
    }
    return siblings.some((node) => node.children && visit(node.children));
  };
  visit(tree);
  return next;
}

export function expansionForSelection(
  tree: readonly NavigationNode[],
  selected: string | null,
): Set<string> {
  const visit = (nodes: readonly NavigationNode[], parents: string[]): string[] | undefined => {
    for (const node of nodes) {
      const path = [...parents, node.id];
      if (node.batchDir === selected) return path;
      const found = node.children && visit(node.children, path);
      if (found) return found;
    }
  };
  return new Set(visit(tree, []) ?? []);
}
