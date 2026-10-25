import { Hint } from '../ui.js';
import { useContext, type ComponentPropsWithRef } from 'react';
import type { Finding } from '../../../core/types.js';
import { CorrectionContext, type Request } from './context.js';
export function CorrectionAction({
  finding,
  file,
  material,
  global = false,
}: {
  finding?: Finding;
  file?: string;
  material?: Request['material'];
  global?: boolean;
}) {
  const open = useContext(CorrectionContext);
  if (!open) return null;
  return (
    <Hint text="也可以把改好的文件拖到这里">
      <button
        type="button"
        onClick={() => open({ finding, file, material })}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const item = e.dataTransfer.files[0];
          if (item)
            open({ finding, file, material, source: window.precheck.droppedFilePath(item) });
        }}
      >
        {global ? '检查单个文件' : '放入改好的文件'}
      </button>
    </Hint>
  );
}
export function CorrectionDrop({
  finding,
  file,
  className,
  children,
  ...props
}: {
  finding: Finding;
  file?: string;
} & ComponentPropsWithRef<'div'>) {
  const open = useContext(CorrectionContext);
  return (
    <div
      {...props}
      className={className}
      onDragOver={(e) => {
        if (open && finding.severity !== 'info') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={(e) => {
        if (!open || finding.severity === 'info') return;
        e.preventDefault();
        e.stopPropagation();
        const item = e.dataTransfer.files[0];
        if (item) open({ finding, file, source: window.precheck.droppedFilePath(item) });
      }}
    >
      {children}
    </div>
  );
}
