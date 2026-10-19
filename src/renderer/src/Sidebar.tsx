import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { WorkspaceView } from '../../shared/api.js';
import {
  buildWorkspaceTree,
  expandExclusive,
  expansionForSelection,
  clampSidebarWidth,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  type GroupNode,
} from '../../shared/navigation.js';
import { nameOf } from './ui.js';

export function Sidebar({
  workspace,
  selected,
  selectedGroup,
  selectionRevision,
  settingsOpen,
  busy,
  width,
  select,
  open,
  refresh,
  settings,
  resize,
  resized,
}: {
  workspace: WorkspaceView;
  selected: string | null;
  selectedGroup?: string;
  selectionRevision?: number;
  settingsOpen: boolean;
  busy: boolean;
  width: number;
  select: (dir: string, group?: string) => void;
  open: () => void;
  refresh: () => void;
  settings: () => void;
  resize: (width: number) => void;
  resized: (width: number) => void;
}) {
  const nodes = buildWorkspaceTree(workspace);
  const [expanded, setExpanded] = useState(() => expansionForSelection(nodes, selected));
  const [focused, setFocused] = useState(selected ?? nodes[0]?.id);
  const tree = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; current: number } | null>(null);
  useEffect(() => {
    setExpanded(expansionForSelection(nodes, selected));
  }, [selected, selectedGroup, selectionRevision]);
  useEffect(() => {
    const visible = Array.from(
      tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    );
    if (!visible.some((node) => node.dataset.nodeId === focused)) {
      setFocused(
        (visible.find((node) => node.dataset.nodeId === selected) ?? visible[0])?.dataset.nodeId,
      );
    }
  }, [expanded, focused, selected]);
  const toggle = (id: string, value: boolean) =>
    setExpanded((old) => {
      if (value) return expandExclusive(old, id, nodes);
      const next = new Set(old);
      next.delete(id);
      return next;
    });
  const selectNode = (batchDir: string, group?: string) => {
    setExpanded(expansionForSelection(nodes, batchDir));
    select(batchDir, group);
  };
  const focusNode = (id: string) => {
    const element = Array.from(
      tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    ).find((node) => node.dataset.nodeId === id);
    element?.focus();
  };
  const keyboard = (
    event: KeyboardEvent<HTMLElement>,
    id: string,
    batchDir: string,
    group?: string,
    parentId?: string,
    branch = false,
  ) => {
    const visible = Array.from(
      tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    );
    const index = visible.indexOf(event.currentTarget);
    switch (event.key) {
      case 'ArrowDown':
        visible[Math.min(index + 1, visible.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        visible[Math.max(index - 1, 0)]?.focus();
        break;
      case 'Home':
        visible[0]?.focus();
        break;
      case 'End':
        visible.at(-1)?.focus();
        break;
      case 'ArrowRight':
        if (branch) {
          if (expanded.has(id)) visible[index + 1]?.focus();
          else toggle(id, true);
        }
        break;
      case 'ArrowLeft':
        if (branch && expanded.has(id)) toggle(id, false);
        else if (parentId) focusNode(parentId);
        break;
      case 'Enter':
      case ' ':
        if (branch) toggle(id, true);
        selectNode(batchDir, group);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  const renderChildren = (
    children: GroupNode[],
    parentId: string,
    level: number,
  ): React.ReactNode =>
    children.map((group) => {
      const branch = group.kind === 'labor';
      const target = branch ? undefined : (group.target ?? group.label);
      return (
        <div role="none" key={group.id}>
          <button
            className="tree-node group-node"
            role="treeitem"
            aria-level={level}
            aria-expanded={branch ? expanded.has(group.id) : undefined}
            aria-selected={
              !settingsOpen &&
              selected === group.batchDir &&
              (branch ? !selectedGroup : selectedGroup === target)
            }
            data-node-id={group.id}
            tabIndex={focused === group.id ? 0 : -1}
            disabled={busy}
            style={{ paddingLeft: 12 + (level - 1) * 20 }}
            onFocus={() => setFocused(group.id)}
            onKeyDown={(e) => keyboard(e, group.id, group.batchDir, target, parentId, branch)}
            onClick={() => {
              if (branch) toggle(group.id, true);
              selectNode(group.batchDir, target);
            }}
          >
            {branch && (
              <span
                className="tree-chevron"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(group.id, !expanded.has(group.id));
                }}
              >
                {expanded.has(group.id) ? '▾' : '▸'}
              </span>
            )}
            <span
              className={group.status}
              aria-label={{ missing: '缺失', unconfirmed: '待确认', found: '齐全' }[group.status]}
            >
              {{ missing: '✗', unconfirmed: group.kind ? '!' : '?', found: '✓' }[group.status]}
            </span>
            <span className="tree-label" title={group.tooltip ?? group.target ?? group.label}>
              {group.label}
            </span>
            {!!group.errors && <span className="tree-badge error">✗ {group.errors}</span>}
          </button>
          {branch && expanded.has(group.id) && (
            <div role="group">{renderChildren(group.children ?? [], group.id, level + 1)}</div>
          )}
        </div>
      );
    });

  return (
    <>
      <aside
        className="sidebar"
        style={{ width: `min(${width}px, calc(100vw - 550px))` }}
        aria-label="工作区侧栏"
        aria-busy={busy}
      >
        <div className="sidebar-heading">
          <button
            className="workspace-name text-button"
            title={workspace.dir}
            disabled={busy}
            onClick={() => select('')}
          >
            {nameOf(workspace.dir)}
          </button>
          <div className="actions">
            <button disabled={busy} onClick={open}>
              打开其他文件夹
            </button>
            <button disabled={busy} onClick={refresh}>
              全部重新检查
            </button>
          </div>
          {busy && (
            <p className="sidebar-loading" role="status">
              ◌ 正在检查…
            </p>
          )}
        </div>
        <div className="explorer-tree" role="tree" aria-label="工作区文件夹" ref={tree}>
          {nodes.map((node) => (
            <div key={node.id} role="none" className={node.readOnly ? 'reference-node' : ''}>
              <button
                className="tree-node batch-node"
                role="treeitem"
                aria-level={1}
                aria-label={
                  node.readOnly
                    ? node.label + '，只读参考'
                    : `${node.label}，错误 ${node.errors}，警告 ${node.warnings}${node.submitted ? '，已报销' : ''}`
                }
                aria-expanded={expanded.has(node.id)}
                aria-owns={
                  expanded.has(node.id) ? 'tree-children-' + encodeURIComponent(node.id) : undefined
                }
                aria-selected={!settingsOpen && selected === node.batchDir && !selectedGroup}
                data-node-id={node.id}
                data-batch-id={node.label}
                tabIndex={focused === node.id ? 0 : -1}
                disabled={busy}
                onFocus={() => setFocused(node.id)}
                onKeyDown={(e) => keyboard(e, node.id, node.batchDir, undefined, undefined, true)}
                onClick={() => {
                  toggle(node.id, true);
                  selectNode(node.batchDir);
                }}
              >
                <span
                  className="tree-chevron"
                  aria-label={expanded.has(node.id) ? '折叠批次' : '展开批次'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(node.id, !expanded.has(node.id));
                  }}
                >
                  {expanded.has(node.id) ? '▾' : '▸'}
                </span>
                <span className="tree-label" title={node.label}>
                  {node.kind === 'labor' ? (node.errors ? '✗ ' : node.warnings ? '! ' : '✓ ') : ''}
                  {node.label}
                </span>
                {node.readOnly ? (
                  <span className="tree-tag">参考</span>
                ) : (
                  <>
                    {node.errors > 0 && (
                      <span className="tree-badge error" title="错误数">
                        ✗ {node.errors}
                      </span>
                    )}
                    {node.warnings > 0 && (
                      <span className="tree-badge warning" title="警告数">
                        ! {node.warnings}
                      </span>
                    )}
                    {node.submitted && <span className="tree-tag">已报销</span>}
                  </>
                )}
              </button>
              {expanded.has(node.id) && (
                <div role="group" id={'tree-children-' + encodeURIComponent(node.id)}>
                  {renderChildren(node.children, node.id, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button aria-pressed={settingsOpen} onClick={settings} disabled={busy}>
            ⚙ 设置
          </button>
        </div>
      </aside>
      <div
        className="sidebar-separator"
        role="separator"
        aria-label="调整侧栏宽度"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          drag.current = { x: e.clientX, width, current: width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const value = clampSidebarWidth(drag.current.width + e.clientX - drag.current.x);
          drag.current.current = value;
          resize(value);
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          resized(drag.current.current);
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          if (drag.current) resized(drag.current.current);
          drag.current = null;
        }}
        onKeyDown={(e) => {
          const value =
            e.key === 'ArrowLeft'
              ? width - 16
              : e.key === 'ArrowRight'
                ? width + 16
                : e.key === 'Home'
                  ? SIDEBAR_MIN
                  : e.key === 'End'
                    ? SIDEBAR_MAX
                    : null;
          if (value === null) return;
          e.preventDefault();
          resize(clampSidebarWidth(value));
          resized(clampSidebarWidth(value));
        }}
      />
    </>
  );
}
