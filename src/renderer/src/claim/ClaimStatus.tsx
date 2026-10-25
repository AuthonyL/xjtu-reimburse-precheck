import localStyles from './claim.module.css';
import styles from '../styles/forms.module.css';
import uiStyles from '../styles/ui.module.css';
import { Pill, TextButton } from '../ui.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun } from '../store/status.js';
import { useId, useState } from 'react';
import type { ClaimState } from '../../../core/domain/claim.js';
import { availableTransitions, CLAIM_STATE_LABELS } from '../../../core/domain/transitions.js';
import type { Claim } from '../../../core/domain/claim.js';

export function ClaimBadge({ state }: { state: ClaimState }) {
  return <Pill tone="info">{CLAIM_STATE_LABELS[state]}</Pill>;
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
      className={styles.manualForm}
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
      <div className={uiStyles.actions + ' ' + localStyles.toolbarActions}>
        <button type="submit" className={uiStyles.primary} disabled={!reason.trim() || saving}>
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
  claim,
  dir,
  readOnly,
}: {
  claim: Claim;
  dir: string;
  readOnly?: boolean;
}) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const [target, setTarget] = useState<ClaimState | null>(null);
  const targets = availableTransitions(claim.state);
  const transition = (to: ClaimState, note?: string) =>
    run(async () => {
      await apply(() => window.precheck.transitionClaim(dir, to, note));
      setTarget(null);
    }, '报销状态已更新为' + CLAIM_STATE_LABELS[to]);
  return (
    <>
      <ClaimBadge state={claim.state} />
      {!readOnly && (
        <div className={uiStyles.actions + ' ' + localStyles.toolbarActions}>
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

export function FindingWaiver({
  scope,
  findingId,
  waived,
  reason,
}: {
  scope: string;
  findingId: string;
  waived: boolean;
  reason?: string;
}) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const view = useWorkspaceStore((state) =>
    state.view?.batches.find((batch) => batch.batch.dir === scope),
  );
  const waive =
    view && !view.readOnly
      ? async (id: string, reason: string) => {
          await apply(() => window.precheck.waiveFinding(scope, id, reason));
        }
      : undefined;
  const unwaive =
    view && !view.readOnly
      ? async (id: string) => {
          await apply(() => window.precheck.unwaiveFinding(scope, id));
        }
      : undefined;
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
    <TextButton type="button" onClick={() => setEditing(true)}>
      豁免…
    </TextButton>
  );
}
