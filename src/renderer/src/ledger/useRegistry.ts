import { useEffect, useState } from 'react';
import type { Registry } from '../../../core/domain/registry.js';
import type { WorkspaceView } from '../../../shared/api.js';

export function useRegistry(view: WorkspaceView) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    view: WorkspaceView;
    registry?: Registry;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    void window.precheck.registry().then(
      (registry) => {
        if (active) setResult({ view, registry });
      },
      (error: unknown) => {
        if (active)
          setResult({ view, error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [view, revision]);
  return {
    registry: result?.view === view ? result.registry : undefined,
    error: result?.view === view ? result.error : undefined,
    retry: () => {
      setResult(undefined);
      setRevision((current) => current + 1);
    },
  };
}
