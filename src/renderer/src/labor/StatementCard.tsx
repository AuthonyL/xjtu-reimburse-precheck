import styles from '../styles/ui.module.css';
import laborLaborStyles from './labor.module.css';
import findingsStyles from '../styles/findings.module.css';
import type { LaborEntry, LaborAttachment } from '../../../core/labor/types.js';
import type { RuleConfig } from '../../../core/rules/config.js';
import { generateLaborText } from '../../../core/labor/template-text.js';
import { laborAnchor } from '../../../shared/navigation.js';
import { FileLink } from '../ui.js';
import { Collapsible } from '../Collapsible.js';
import { FindingList } from '../FindingItem.js';
import { useLaborDraft } from './useLaborDraft.js';
import { LaborManualForm } from './LaborManualForm.js';
import { StandardsTable } from './StandardsTable.js';
import { LaborAttachments } from './LaborAttachments.js';
import { LaborTemplate } from './LaborTemplate.js';

export function StatementCard({
  entry,
  ordinal,
  dir,
  config,
  highlight,
  attachments,
  versionNote,
  otherFiles,
}: {
  entry: LaborEntry;
  ordinal: number;
  dir: string;
  config: RuleConfig;
  highlight?: string;
  attachments: LaborAttachment[];
  versionNote?: string;
  otherFiles: Record<string, string>;
}) {
  const model = useLaborDraft(entry, config);
  const errors = entry.findings.filter((f) => f.severity === 'error').length;
  const warnings = entry.findings.filter((f) => f.severity === 'warning').length;
  const preview = generateLaborText(model.fields, config);
  return (
    <article
      className={
        styles.panel +
        ' ' +
        laborLaborStyles.laborCard +
        (highlight === entry.relativePath ? ' ' + 'group-highlight' : '')
      }
      id={laborAnchor(entry.relativePath)}
      data-testid="labor-entry"
      data-labor-file={entry.relativePath}
    >
      <div className={styles.cardHeading}>
        <h2>
          <span data-testid="labor-ordinal">{ordinal}.</span> {errors ? '✗' : warnings ? '!' : '✓'}{' '}
          {entry.fields.name ?? entry.relativePath}
        </h2>
        <span>
          错误 {errors} · 警告 {warnings}
        </span>
      </div>
      <FileLink file={entry.path} />
      {!!entry.otherVersions?.length && (
        <p className={findingsStyles.inferredReason}>
          {versionNote}
          。另一版本：
          {entry.otherVersions.map((file) => (
            <FileLink key={file} file={otherFiles[file]!} />
          ))}
        </p>
      )}
      <section aria-label="劳务问题">
        <h3>问题与处理</h3>
        <FindingList
          scope={dir}
          findings={entry.findings.map((finding) => ({ finding, file: entry.relativePath }))}
        />
        {!errors && !warnings && <p className={'found'}>✓ 当前检查未发现错误或警告</p>}
      </section>
      <Collapsible
        scope={dir}
        disclosureKey={entry.relativePath + ':fields'}
        title="抽取字段与手动补充"
        summary="姓名、职称、日期和金额"
        level={3}
      >
        <LaborManualForm entry={entry} dir={dir} model={model} />
      </Collapsible>
      <Collapsible
        scope={dir}
        disclosureKey={entry.relativePath + ':standards'}
        title="适用标准"
        summary={entry.standards.map((row) => row.label).join('；') || '待补充条件'}
        level={3}
      >
        <StandardsTable standards={entry.standards} requirements={entry.requirements} />
      </Collapsible>
      <Collapsible
        scope={dir}
        disclosureKey={entry.relativePath + ':attachments'}
        title="附件与发放表金额"
        summary={`${attachments.length} 个`}
        level={3}
      >
        <LaborAttachments
          dir={dir}
          file={entry.relativePath}
          attachments={attachments}
          model={model}
        />
      </Collapsible>
      <Collapsible
        scope={dir}
        disclosureKey={entry.relativePath + ':template'}
        title="生成规范情况说明"
        summary="预览、复制文本、导出 Word"
        level={3}
      >
        <LaborTemplate dir={dir} file={entry.relativePath} preview={preview} draft={model.draft} />
      </Collapsible>
    </article>
  );
}
