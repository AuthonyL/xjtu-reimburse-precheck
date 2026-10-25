import styles from './styles/disclosure.module.css';
import { Hint } from './ui.js';
import { useId, type ReactNode } from 'react';
import { Collapsible as Disclosure } from 'radix-ui';
import { useDisclosures } from './disclosures.js';

export function Collapsible({
  scope,
  disclosureKey,
  title,
  summary,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  level = 2,
  testId,
  attention = false,
  className = '',
}: {
  scope: string;
  disclosureKey: string;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  level?: 2 | 3;
  testId?: string;
  attention?: boolean;
  className?: string;
}) {
  const [entries, setEntries] = useDisclosures(scope, 'sections');
  const expanded = open ?? entries[disclosureKey] ?? defaultOpen;
  const id = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <Disclosure.Root
      asChild
      open={expanded}
      onOpenChange={(next) => {
        if (onOpenChange) onOpenChange(next);
        else setEntries([disclosureKey], next);
      }}
    >
      <section
        className={styles.collapsible + ' ' + className}
        data-testid={testId}
        aria-label={title}
      >
        <Heading className={styles.collapsibleHeading}>
          <Disclosure.Trigger asChild>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={id}
              className={styles.collapsibleToggle}
              aria-label={
                typeof summary === 'string'
                  ? `${title} · ${attention ? '! ' : ''}${summary}`
                  : undefined
              }
            >
              <span>{title}</span>
              {summary != null && (
                <Hint text={typeof summary === 'string' ? summary : undefined}>
                  <span
                    className={
                      styles.collapsibleSummary + (attention ? ' ' + styles.attention : '')
                    }
                  >
                    {' '}
                    · {attention ? '! ' : ''}
                    {summary}
                  </span>
                </Hint>
              )}
              <span aria-hidden="true" className={styles.disclosureChevron}>
                {expanded ? '▾' : '▸'}
              </span>
            </button>
          </Disclosure.Trigger>
        </Heading>
        <Disclosure.Content asChild forceMount>
          <div id={id} hidden={!expanded} className={styles.collapsibleContent}>
            {children}
          </div>
        </Disclosure.Content>
      </section>
    </Disclosure.Root>
  );
}
