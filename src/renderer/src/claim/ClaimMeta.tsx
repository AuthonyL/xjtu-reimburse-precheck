import { useEffect, useRef, useState } from 'react';
import type { Claim } from '../../../core/domain/claim.js';
import type { ClaimMeta as Meta } from '../../../shared/api.js';
import { FUND_LABELS } from '../../../core/export/ledger.js';
import { useStatusStore } from '../store/status.js';
import { useWorkspaceStore } from '../store/workspace.js';
import { TextButton } from '../ui.js';
import styles from './meta.module.css';

const metaOf = (claim: Claim): Meta => ({
  claimant: claim.claimant || '',
  project: claim.project || '',
  fund: claim.fund,
});
export function ClaimMeta({
  claim,
  dir,
  readOnly,
}: {
  claim: Claim;
  dir: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => metaOf(claim));
  const [saved, setSaved] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);
  const persisted = useRef(metaOf(claim));
  const pending = useRef(false);
  const apply = useWorkspaceStore((state) => state.apply);
  useEffect(() => {
    const next = metaOf(claim);
    persisted.current = next;
    setDraft(next);
  }, [claim.claimant, claim.project, claim.fund]);
  const save = () => {
    if (pending.current) return;
    if (JSON.stringify(draft) === JSON.stringify(persisted.current)) {
      setEditing(false);
      return;
    }
    pending.current = true;
    setSaving(true);
    setSaved(null);
    const workspaceDir = useWorkspaceStore.getState().view?.dir;
    useStatusStore.setState({ error: '' });
    void (async () => {
      try {
        await apply(async () => {
          const next = await window.precheck.updateClaim(dir, draft);
          const current = useWorkspaceStore.getState().view;
          if (current && current.dir === workspaceDir)
            return { ...next, selectedBatchDir: current.selectedBatchDir };
        });
        persisted.current = draft;
        setSaved(draft);
        setEditing(false);
      } catch (error) {
        useStatusStore.setState({ error: error instanceof Error ? error.message : String(error) });
      }
    })().finally(() => {
      pending.current = false;
      setSaving(false);
    });
  };
  if (!editing || readOnly)
    return (
      <div className={styles.metaSummary}>
        <span>
          经办人：{claim.claimant || '—'} · 项目：{claim.project || '—'} · 经费：
          {claim.fund ? FUND_LABELS[claim.fund] : '未填'}
        </span>
        {!readOnly && <TextButton onClick={() => setEditing(true)}>编辑</TextButton>}
        <span role="status" className={styles.saved}>
          {saved ? '已保存' : ''}
        </span>
      </div>
    );
  return (
    <form
      className={styles.meta}
      aria-label="报销单信息"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) save();
      }}
    >
      <label>
        经办人
        <input
          value={draft.claimant}
          disabled={saving}
          onChange={(event) => {
            setSaved(null);
            setDraft({ ...draft, claimant: event.target.value });
          }}
        />
      </label>
      <label>
        项目 / 经费卡
        <input
          value={draft.project}
          disabled={saving}
          onChange={(event) => {
            setSaved(null);
            setDraft({ ...draft, project: event.target.value });
          }}
        />
      </label>
      <label>
        经费类型
        <select
          value={draft.fund || ''}
          disabled={saving}
          onChange={(event) => {
            setSaved(null);
            setDraft({ ...draft, fund: (event.target.value || undefined) as Meta['fund'] });
          }}
        >
          <option value="">未填</option>
          {Object.entries(FUND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={saving}>
        保存
      </button>
      <span role="status" className={styles.saved}>
        {saving ? '保存中…' : saved ? '已保存' : ''}
      </span>
    </form>
  );
}
