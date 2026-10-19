import { useId, type ReactNode } from 'react';
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
    <section className={'collapsible ' + className} data-testid={testId} aria-label={title}>
      <Heading className="collapsible-heading">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          className="collapsible-toggle"
          aria-label={
            typeof summary === 'string'
              ? `${title} · ${attention ? '! ' : ''}${summary}`
              : undefined
          }
          onClick={() => {
            if (onOpenChange) onOpenChange(!expanded);
            else setEntries([disclosureKey], !expanded);
          }}
        >
          <span>{title}</span>
          {summary != null && (
            <span
              className={'collapsible-summary' + (attention ? ' attention' : '')}
              title={typeof summary === 'string' ? summary : undefined}
            >
              {' '}
              · {attention ? '! ' : ''}
              {summary}
            </span>
          )}
          <span aria-hidden="true" className="disclosure-chevron">
            {expanded ? '▾' : '▸'}
          </span>
        </button>
      </Heading>
      <div id={id} hidden={!expanded} className="collapsible-content">
        {children}
      </div>
    </section>
  );
}
