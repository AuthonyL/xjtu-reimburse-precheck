import { useEffect, useState } from 'react';
import { screen } from '@testing-library/react';
import type { Finding } from '../src/core/types.js';
import type { BatchView, WorkspaceView } from '../src/shared/api.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import { FindingList } from '../src/renderer/src/FindingItem.js';
import {
  DisclosureProvider,
  reconcileDisclosures,
  type DisclosureState,
} from '../src/renderer/src/disclosures.js';
import { batch, config, finding as makeFinding } from './helpers.js';
import { defaultClaim } from '../src/core/domain/claim.js';

export const finding = (ruleId: string, code: string): Finding =>
  makeFinding({
    ruleId,
    code,
    severity: 'warning',
    message: '问题-' + code,
    action: '处理-' + code,
    invoiceNumbers: ['SYNTH-1'],
    files: ['/synthetic/a.pdf'],
    groupId: '根目录',
  });
export const view = (): BatchView => {
  const b = batch();
  return {
    batch: b,
    report: buildReport(checkBatch(b, config())),
    claim: defaultClaim(b.id, '2026-10-25T00:00:00.000Z'),
    waived: 0,
    markedAt: null,
    manualTasks: [],
    outputs: [],
  };
};
export function Harness({ findings, dir = '/synthetic' }: { findings: Finding[]; dir?: string }) {
  const [state, setState] = useState<DisclosureState>({});
  useEffect(() => {
    const b = view();
    b.batch.dir = dir;
    b.report.findings = findings;
    const workspace: WorkspaceView = {
      kind: 'batch',
      dir,
      openedDir: dir,
      selectedBatchDir: dir,
      batches: [b],
      rejected: null,
    };
    setState((old) => reconcileDisclosures(old, workspace));
  }, [findings, dir]);
  return (
    <DisclosureProvider state={state} setState={setState}>
      <FindingList scope={dir} findings={findings.map((f) => ({ finding: f }))} />
    </DisclosureProvider>
  );
}
export const rows = [finding('F2', 'one'), finding('F2', 'two'), finding('R2', 'three')];
export const item = (code: string) =>
  screen.getByRole('button', { name: new RegExp('问题-' + code) });
