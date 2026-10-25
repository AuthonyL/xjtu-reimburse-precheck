import { batch, config, invoice, line } from './helpers.js';
import { checkBatch } from '../src/core/rules/engine.js';
import { buildReport } from '../src/core/report.js';
import { defaultClaim, type ClaimState } from '../src/core/domain/claim.js';
import type { BatchView, WorkspaceView } from '../src/shared/api.js';
import type { Invoice } from '../src/core/types.js';

export function pageBatch(id: string, invoices: Invoice[], state: ClaimState = 'draft'): BatchView {
  const current = { ...batch(invoices, 'PCB'), id, dir: '/synthetic/' + id };
  return {
    batch: current,
    report: buildReport(checkBatch(current, config())),
    claim: { ...defaultClaim(id, '2026-01-01'), state },
    waived: 0,
    markedAt: null,
    manualTasks: [],
    outputs: [],
  };
}
export function pageWorkspace(): WorkspaceView {
  const first = pageBatch('20260102', [
    invoice({ number: 'SYNTH-DUP', total: 100 }),
    invoice({ number: 'SYNTH-USD', currency: 'USD', total: 20, date: '' }),
  ]);
  const second = pageBatch(
    '20260103',
    [
      invoice({
        number: 'SYNTH-DUP',
        date: '2026-01-03',
        total: 300,
        seller: { name: 'Zeta 合成公司', taxId: '' },
        lines: [line({ name: '合成芯片' })],
      }),
    ],
    'submitted',
  );
  first.report.groups[0]!.invoices.forEach((checked) => {
    checked.expenseContent = '实验材料费';
  });
  second.report.groups[0]!.invoices[0]!.expenseContent = '办公费';
  return {
    kind: 'root',
    dir: '/synthetic',
    openedDir: '/synthetic',
    selectedBatchDir: null,
    batches: [first, second],
    rejected: pageBatch('无法报销费用', [invoice({ number: 'SYNTH-REF', total: 999 })]),
  };
}
