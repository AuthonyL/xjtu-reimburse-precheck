import styles from './correction.module.css';
import { useRef, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';

export function CorrectionModal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogBackdrop}>
          <Dialog.Content
            className={styles.fileCheckDialog}
            data-testid="single-file-dialog"
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              heading.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (previous.current?.isConnected) previous.current.focus();
            }}
            onInteractOutside={(event) => event.preventDefault()}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              close();
            }}
          >
            <Dialog.Title asChild>
              <h2 ref={heading} tabIndex={-1}>
                {title}
              </h2>
            </Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
