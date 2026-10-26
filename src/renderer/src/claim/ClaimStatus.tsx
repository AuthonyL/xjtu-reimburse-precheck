import uiStyles from '../styles/ui.module.css';
import { Pill, TextButton } from '../ui.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun } from '../store/status.js';
import { useRef, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { ClaimReasonForm } from './ClaimReasonForm.js';
import type { ClaimState } from '../../../core/domain/claim.js';
import { availableTransitions, CLAIM_STATE_LABELS } from '../../../core/domain/transitions.js';
import type { Claim } from '../../../core/domain/claim.js';

export function ClaimBadge({ state }: { state: ClaimState }) {
  return <Pill tone={state}>{CLAIM_STATE_LABELS[state]}</Pill>;
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
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const targets = availableTransitions(claim.state);
  const transition = (to: ClaimState, note?: string) =>
    run(async () => {
      await apply(() => window.precheck.transitionClaim(dir, to, note));
      setTarget(null);
    }, '报销状态已更新为' + CLAIM_STATE_LABELS[to]);
  return (
    <>
      {readOnly ? (
        <ClaimBadge state={claim.state} />
      ) : (
        <div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={uiStyles.statusTrigger}
                aria-label={'状态：' + CLAIM_STATE_LABELS[claim.state]}
                disabled={!targets.length}
              >
                状态：
                <ClaimBadge state={claim.state} /> <span aria-hidden="true">▾</span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={uiStyles.menu}
                align="start"
                sideOffset={4}
                onCloseAutoFocus={(event) => {
                  if (target) {
                    event.preventDefault();
                    reasonField.current?.focus();
                  }
                }}
              >
                {targets.map((to) => (
                  <DropdownMenu.Item
                    key={to}
                    className={uiStyles.menuItem}
                    onSelect={() => {
                      if (to === 'returned' || to === 'rejected') setTarget(to);
                      else void transition(to);
                    }}
                  >
                    标记为{CLAIM_STATE_LABELS[to]}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {target && targets.includes(target) && (
            <ClaimReasonForm
              textareaRef={reasonField}
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
    <ClaimReasonForm
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
