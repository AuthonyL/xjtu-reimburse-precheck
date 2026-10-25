import styles from './labor/labor.module.css';
import uiStyles from './styles/ui.module.css';
import { useRun } from './store/status.js';
import type { LaborView } from '../../shared/api.js';
import type { RuleConfig } from '../../core/rules/config.js';
import { FileLink } from './ui.js';
import { CorrectionProvider, ReplacementRecords } from './SingleFileCheck.js';
import { RuleHelpProvider } from './RuleHelp.js';
import { Collapsible } from './Collapsible.js';
import { FindingList } from './FindingItem.js';
import { LaborHeader } from './labor/LaborHeader.js';
import { StatementCard } from './labor/StatementCard.js';

export function LaborPage({
  view,
  config,
  highlight,
}: {
  view: LaborView;
  config: RuleConfig;
  highlight?: string;
}) {
  const run = useRun();
  return (
    <RuleHelpProvider rules={config}>
      <CorrectionProvider dir={view.report.dir}>
        <main className={styles.laborPage}>
          <LaborHeader report={view.report} />
          {!!view.report.diagnostics.length && (
            <FindingList
              scope={view.report.dir}
              findings={view.report.diagnostics.map((finding) => ({
                finding,
                reason: '文件或手填数据未能解析。',
                canCorrect: !finding.files.some((file) =>
                  file.replaceAll('\\', '/').includes('/_预检/'),
                ),
              }))}
            />
          )}
          {!view.report.entries.length && (
            <p className={uiStyles.panel}>
              没有可识别的情况说明。请提供有文字层的 PDF 或 .docx，正文或文件名包含“情况说明 /
              发放说明 / 说明”。
            </p>
          )}
          {view.report.entries.map((e, index) => (
            <StatementCard
              ordinal={index + 1}
              key={e.relativePath}
              entry={e}
              dir={view.report.dir}
              attachments={view.report.attachments}
              versionNote={
                view.report.versionGroups.find((g) => g.files.includes(e.relativePath))?.note
              }
              otherFiles={Object.fromEntries(
                view.report.entries.map((entry) => [entry.relativePath, entry.path]),
              )}
              config={config}
              highlight={highlight}
            />
          ))}
          {!view.report.entries.length && (
            <section>
              <h2>附件</h2>
              {view.report.attachments.map((a) => (
                <div key={a.path}>
                  <FileLink file={a.path} />
                  {a.label}
                </div>
              ))}
            </section>
          )}
          <Collapsible
            scope={view.report.dir}
            disclosureKey="outputs"
            title="输出文件"
            summary={`${view.outputs.length} 个 · 替换记录 ${view.replacements?.records.length ?? 0} 条`}
          >
            {view.outputs.map((file) => (
              <FileLink key={file} file={file} />
            ))}
            <button onClick={() => void run(() => window.precheck.openOutput(view.report.dir))}>
              打开输出文件夹
            </button>
            <ReplacementRecords history={view.replacements} dir={view.report.dir} />
          </Collapsible>
        </main>
      </CorrectionProvider>
    </RuleHelpProvider>
  );
}
