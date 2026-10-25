import styles from '../correction/correction.module.css';
import feedbackFeedbackStyles from './feedback.module.css';
import uiStyles from '../styles/ui.module.css';
import { useRef, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';

export function FeedbackDialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const content = useRef<HTMLElement>(null);
  const previous = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={styles.dialogBackdrop}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <Dialog.Content
            asChild
            aria-describedby={undefined}
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              const note =
                content.current?.querySelector<HTMLTextAreaElement>('[aria-label="反馈备注"]');
              if (note) {
                event.preventDefault();
                note.focus();
              }
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (previous.current?.isConnected) previous.current.focus();
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              close();
            }}
          >
            <section
              ref={content}
              className={styles.fileCheckDialog + ' ' + feedbackFeedbackStyles.feedbackDialog}
            >
              <div className={uiStyles.pageHeading}>
                <Dialog.Title asChild>
                  <h2>{title}</h2>
                </Dialog.Title>
                <button type="button" aria-label="关闭对话框" onClick={close}>
                  ×
                </button>
              </div>
              {children}
            </section>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
