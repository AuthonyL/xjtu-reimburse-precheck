import styles from './sidebar.module.css';
import { Hint } from '../ui.js';
import type { BatchNode, GroupNode } from '../../../shared/navigation.js';
import { useTreeState } from './TreeState.js';

export function TreeNode({
  node,
  level,
  parentId,
}: {
  node: BatchNode | GroupNode;
  level: number;
  parentId?: string;
}) {
  const {
    expanded,
    focused,
    selected,
    selectedGroup,
    settingsOpen,
    busy,
    toggle,
    selectNode,
    setFocused,
    keyboard,
  } = useTreeState();
  if (!('status' in node))
    return (
      <div key={node.id} role="none" className={node.readOnly ? styles.referenceNode : ''}>
        <button
          className={styles.treeNode + ' ' + styles.batchNode}
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
            className={styles.treeChevron}
            aria-label={expanded.has(node.id) ? '折叠批次' : '展开批次'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id, !expanded.has(node.id));
            }}
          >
            {expanded.has(node.id) ? '▾' : '▸'}
          </span>
          <Hint text={node.label}>
            <span className={styles.treeLabel}>
              {node.kind === 'labor' ? (node.errors ? '✗ ' : node.warnings ? '! ' : '✓ ') : ''}
              {node.label}
            </span>
          </Hint>
          {node.readOnly ? (
            <span className={styles.treeTag}>参考</span>
          ) : (
            <>
              {node.errors > 0 && (
                <Hint text="错误数">
                  <span className={styles.treeBadge + ' ' + 'error'}>✗ {node.errors}</span>
                </Hint>
              )}
              {node.warnings > 0 && (
                <Hint text="警告数">
                  <span className={styles.treeBadge + ' ' + 'warning'}>! {node.warnings}</span>
                </Hint>
              )}
              {node.submitted && <span className={styles.treeTag}>已报销</span>}
            </>
          )}
        </button>
        {expanded.has(node.id) && (
          <div role="group" id={'tree-children-' + encodeURIComponent(node.id)}>
            {node.children.map((child) => (
              <TreeNode key={child.id} node={child} level={2} parentId={node.id} />
            ))}
          </div>
        )}
      </div>
    );
  const branch = node.kind === 'labor';
  const target = branch ? undefined : (node.target ?? node.label);
  return (
    <div role="none" key={node.id}>
      <button
        className={styles.treeNode + ' ' + styles.groupNode}
        role="treeitem"
        aria-level={level}
        aria-expanded={branch ? expanded.has(node.id) : undefined}
        aria-selected={
          !settingsOpen &&
          selected === node.batchDir &&
          (branch ? !selectedGroup : selectedGroup === target)
        }
        data-node-id={node.id}
        tabIndex={focused === node.id ? 0 : -1}
        disabled={busy}
        style={{ paddingLeft: 12 + (level - 1) * 20 }}
        onFocus={() => setFocused(node.id)}
        onKeyDown={(e) => keyboard(e, node.id, node.batchDir, target, parentId, branch)}
        onClick={() => {
          if (branch) toggle(node.id, true);
          selectNode(node.batchDir, target);
        }}
      >
        {branch && (
          <span
            className={styles.treeChevron}
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id, !expanded.has(node.id));
            }}
          >
            {expanded.has(node.id) ? '▾' : '▸'}
          </span>
        )}
        <span
          className={node.status}
          aria-label={{ missing: '缺失', unconfirmed: '待确认', found: '齐全' }[node.status]}
        >
          {{ missing: '✗', unconfirmed: node.kind ? '!' : '?', found: '✓' }[node.status]}
        </span>
        <Hint text={node.tooltip ?? node.target ?? node.label}>
          <span className={styles.treeLabel}>{node.label}</span>
        </Hint>
        {!!node.errors && <span className={styles.treeBadge + ' ' + 'error'}>✗ {node.errors}</span>}
      </button>
      {branch && expanded.has(node.id) && (
        <div role="group">
          {node.children?.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} parentId={node.id} />
          ))}
        </div>
      )}
    </div>
  );
}
