import { useId, useState } from 'react';
import type { ClaimState } from '../../core/domain/claim.js';
import { availableTransitions, CLAIM_STATE_LABELS } from '../../core/domain/transitions.js';
import type { BatchView, WorkspaceView } from '../../shared/api.js';
import type { Run } from './ui.js';

export function ClaimBadge({ state }: { state: ClaimState }) {
  return <span className="pill info">{CLAIM_STATE_LABELS[state]}</span>;
}

function ReasonForm({
  label,
  title,
  save,
  cancel,
  submit,
}: {
  label: string;
  title: string;
  save: string;
  cancel: () => void;
  submit: (reason: string) => Promise<void>;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="manual-form"
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim() || saving) return;
        setSaving(true);
        void submit(reason.trim()).finally(() => setSaving(false));
      }}
    >
      <strong>{title}</strong>
      <label htmlFor={id}>
        {label}（必填）
        <textarea
          id={id}
          aria-label={label}
          required
          autoFocus
          rows={3}
          maxLength={4000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="actions">
        <button type="submit" className="primary" disabled={!reason.trim() || saving}>
          {save}
        </button>
        <button type="button" disabled={saving} onClick={cancel}>
          取消
        </button>
      </div>
    </form>
  );
}

export function ClaimStatus({
  view,
  run,
  update,
}: {
  view: BatchView;
  run: Run;
  update: (workspace: WorkspaceView) => void;
}) {
  const [target, setTarget] = useState<ClaimState | null>(null);
  const targets = availableTransitions(view.claim.state);
  const transition = (to: ClaimState, note?: string) =>
    run(async () => {
      update(await window.precheck.transitionClaim(view.batch.dir, to, note));
      setTarget(null);
    }, '报销状态已更新为' + CLAIM_STATE_LABELS[to]);
  return (
    <>
      <ClaimBadge state={view.claim.state} />
      {!view.readOnly && (
        <div className="actions">
          {targets.map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => {
                if (to === 'returned' || to === 'rejected') setTarget(to);
                else void transition(to);
              }}
            >
              标记为{CLAIM_STATE_LABELS[to]}
            </button>
          ))}
          {target && targets.includes(target) && (
            <ReasonForm
              key={target}
              title={'标记为' + CLAIM_STATE_LABELS[target]}
              label="状态备注"
              save="保存状态"
              cancel={() => setTarget(null)}
              submit={(note) => transition(target, note)}
            />
          )}
        </div>
      )}
    </>
  );
}

export interface WaiverActions {
  waive?: (findingId: string, reason: string) => Promise<void>;
  unwaive?: (findingId: string) => Promise<void>;
}

export function FindingWaiver({
  findingId,
  waived,
  reason,
  waive,
  unwaive,
  run,
}: WaiverActions & {
  findingId: string;
  waived: boolean;
  reason?: string;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  if (waived)
    return (
      <div>
        {reason && (
          <p>
            豁免理由：<span>{reason}</span>
          </p>
        )}
        {unwaive && (
          <button type="button" onClick={() => void run(() => unwaive(findingId), '已撤销豁免')}>
            撤销豁免
          </button>
        )}
      </div>
    );
  if (!waive) return null;
  return editing ? (
    <ReasonForm
      title="豁免此问题"
      label="豁免理由"
      save="保存豁免"
      cancel={() => setEditing(false)}
      submit={(note) =>
        run(async () => {
          await waive(findingId, note);
          setEditing(false);
        }, '已豁免此问题')
      }
    />
  ) : (
    <button type="button" className="text-button" onClick={() => setEditing(true)}>
      豁免…
    </button>
  );
}
