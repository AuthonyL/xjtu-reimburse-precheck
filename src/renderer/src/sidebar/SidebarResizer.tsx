import styles from './sidebar.module.css';
import { useRef } from 'react';
import { clampSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX } from '../../../shared/navigation.js';
import { useLayoutStore } from '../store/layout.js';

export function SidebarResizer() {
  const width = useLayoutStore((state) => state.sidebarWidth);
  const resize = (sidebarWidth: number) => useLayoutStore.setState({ sidebarWidth });
  const saveLayout = useLayoutStore((state) => state.saveLayout);
  const resized = (sidebarWidth: number) => void saveLayout({ sidebarWidth });
  const drag = useRef<{ x: number; width: number; current: number } | null>(null);
  return (
    <div
      className={styles.sidebarSeparator}
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
  );
}
