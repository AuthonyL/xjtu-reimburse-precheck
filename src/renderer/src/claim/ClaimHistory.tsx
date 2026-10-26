import type { Claim } from '../../../core/domain/claim.js';
import { CLAIM_STATE_LABELS } from '../../../core/domain/transitions.js';
import { displayTime } from '../../../core/export/ledger.js';
import { Collapsible } from '../Collapsible.js';
import styles from './meta.module.css';

export function ClaimHistory({ claim, dir }: { claim: Claim; dir: string }) {
  return (
    <Collapsible
      scope={dir}
      disclosureKey="claim-history"
      className={styles.historyDisclosure}
      title={`流转记录（${claim.transitions.length}）`}
    >
      {claim.transitions.length ? (
        <ol className={styles.history}>
          {claim.transitions.map((transition, index) => (
            <li key={index}>
              <time dateTime={transition.at}>{displayTime(transition.at)}</time>
              <strong>
                {CLAIM_STATE_LABELS[transition.from]} → {CLAIM_STATE_LABELS[transition.to]}
              </strong>
              {transition.note && <span>{transition.note}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p>暂无流转记录。</p>
      )}
    </Collapsible>
  );
}
