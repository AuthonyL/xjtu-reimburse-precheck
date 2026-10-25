import { RETIRED_RULE_NOTES } from '../../../core/rules/catalog.js';
import { Hint } from '../ui.js';
import styles from './rules.module.css';
import uiStyles from '../styles/ui.module.css';

export function RetiredRules({
  notes,
}: {
  notes: ReadonlyArray<(typeof RETIRED_RULE_NOTES)[number]>;
}) {
  return (
    <>
      {notes.map((note) => (
        <Hint key={note.id} text={note.sourceText}>
          <div
            className={styles.retiredRule + ' ' + uiStyles.panel}
            data-testid={'retired-' + note.id}
          >
            R14（README 第 14 条）· {note.note}
            <span className={styles.ruleExcerpt}>原文：{note.sourceText}</span>
          </div>
        </Hint>
      ))}
    </>
  );
}
