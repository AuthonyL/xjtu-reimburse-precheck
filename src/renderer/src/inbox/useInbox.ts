import { useEffect, useState } from 'react';
import type { InboxItem } from '../../../core/types.js';
import { useWorkspaceStore } from '../store/workspace.js';

export function useInbox() {
  const view = useWorkspaceStore((state) => state.view);
  const [result, setResult] = useState<{
    view: typeof view;
    items: InboxItem[];
    error: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = view ? await window.precheck.inbox() : [];
        if (active) setResult({ view, items, error: '' });
      } catch (error) {
        if (active)
          setResult({
            view,
            items: [],
            error: error instanceof Error ? error.message : String(error),
          });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [view]);
  return result?.view === view
    ? { items: result.items, error: result.error, loading: false }
    : { items: [], error: '', loading: true };
}
