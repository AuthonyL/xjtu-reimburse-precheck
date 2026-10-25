import styles from '../styles/ui.module.css';
import type { ReplacementHistory } from '../../../core/correction/types.js';
import { Collapsible } from '../Collapsible.js';
import { FileLink } from '../ui.js';
import { ReplacementRecords } from '../SingleFileCheck.js';

export function OutputsPanel({
  outputs,
  history,
  dir,
  readOnly,
}: {
  outputs: string[];
  history?: ReplacementHistory;
  dir: string;
  readOnly?: boolean;
}) {
  return (
    <Collapsible
      scope={dir}
      disclosureKey="outputs"
      title="输出文件"
      summary={`${outputs.length} 个 · 替换记录 ${history?.records.length ?? 0} 条`}
      testId="export-list"
    >
      {outputs.length ? (
        <div className={styles.panel}>
          {outputs.map((file) => (
            <FileLink file={file} key={file} />
          ))}
        </div>
      ) : (
        <p className={styles.muted}>导出后保存在本批次的 _预检 文件夹。</p>
      )}
      {!readOnly && <ReplacementRecords history={history} dir={dir} />}
    </Collapsible>
  );
}
