import { useEffect, useState } from 'react';
import type { LaborView, WorkspaceView } from '../../shared/api.js';
import type { RuleConfig } from '../../core/rules/config.js';
import { LABOR_TYPES, type LaborEntry, type LaborManualEntry } from '../../core/labor/types.js';
import { generateLaborText } from '../../core/labor/template-text.js';
import { applyLaborManual } from '../../core/labor/parse.js';
import { LABOR_UNITS } from '../../core/labor/validation.js';
import { laborAnchor } from '../../shared/navigation.js';
import { FileLink, money, type Run } from './ui.js';
import { CorrectionProvider, CorrectionAction, ReplacementRecords } from './SingleFileCheck.js';
import { RuleHelpProvider } from './RuleHelp.js';
import { Collapsible } from './Collapsible.js';
import { FindingList } from './FindingItem.js';

function LaborCard({
  entry,
  ordinal,
  view,
  config,
  run,
  update,
  highlight,
}: {
  entry: LaborEntry;
  ordinal: number;
  view: LaborView;
  config: RuleConfig;
  run: Run;
  update: (w: WorkspaceView) => void;
  highlight?: string;
}) {
  const [draft, setDraft] = useState<LaborManualEntry>(structuredClone(entry.manual));
  const [datesText, setDatesText] = useState(entry.fields.dates.map((d) => d.date).join('\n'));
  const stored = JSON.stringify(entry.manual);
  const parsed = JSON.stringify(entry.parsed);
  useEffect(() => {
    setDraft(structuredClone(entry.manual));
    setDatesText(entry.fields.dates.map((d) => d.date).join('\n'));
  }, [stored, parsed]);
  const fields = applyLaborManual(entry.parsed, draft, config);
  const set = (key: keyof LaborManualEntry, value: unknown) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const source = (key: keyof LaborManualEntry) => (
    <small className="field-origin">
      {Object.hasOwn(draft, key) || !Object.hasOwn(entry.parsed, key) ? '手动' : '解析'}
    </small>
  );
  const select = (key: keyof LaborManualEntry, label: string, options: Record<string, string>) => (
    <label key={key}>
      {label}
      {source(key)}
      <select
        aria-label={label}
        value={(draft[key] ?? (fields as unknown as Record<string, unknown>)[key] ?? '') as string}
        onChange={(e) => {
          if (['studentLevel', 'workTime', 'personnelRole'].includes(key) && !e.target.value) {
            setDraft((old) => {
              const next = { ...old };
              delete next[key];
              return next;
            });
          } else set(key, e.target.value || null);
        }}
      >
        <option value="">待补充</option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const errors = entry.findings.filter((f) => f.severity === 'error').length;
  const warnings = entry.findings.filter((f) => f.severity === 'warning').length;
  const preview = generateLaborText(fields, config);
  return (
    <article
      className={'panel labor-card' + (highlight === entry.relativePath ? ' group-highlight' : '')}
      id={laborAnchor(entry.relativePath)}
      data-testid="labor-entry"
      data-labor-file={entry.relativePath}
    >
      <div className="card-heading">
        <h2>
          <span data-testid="labor-ordinal">{ordinal}.</span> {errors ? '✗' : warnings ? '!' : '✓'}{' '}
          {entry.fields.name ?? entry.relativePath}
        </h2>
        <span>
          错误 {errors} · 警告 {warnings}
        </span>
      </div>
      <FileLink file={entry.path} run={run} />
      {!!entry.otherVersions?.length && (
        <p className="inferred-reason">
          {view.report.versionGroups.find((g) => g.files.includes(entry.relativePath))?.note}
          。另一版本：
          {entry.otherVersions.map((file) => (
            <FileLink
              key={file}
              file={view.report.entries.find((e) => e.relativePath === file)!.path}
              run={run}
            />
          ))}
        </p>
      )}
      <section aria-label="劳务问题">
        <h3>问题与处理</h3>
        <FindingList
          scope={view.report.dir}
          run={run}
          findings={entry.findings.map((finding) => ({ finding, file: entry.relativePath }))}
        />
        {!errors && !warnings && <p className="found">✓ 当前检查未发现错误或警告</p>}
      </section>
      <Collapsible
        scope={view.report.dir}
        disclosureKey={entry.relativePath + ':fields'}
        title="抽取字段与手动补充"
        summary="姓名、职称、日期和金额"
        level={3}
      >
        <p className="small muted">修改后保存再核对问题和标准；规范说明预览随字段实时更新。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              async () =>
                update(await window.precheck.saveLabor(view.report.dir, entry.relativePath, draft)),
              '本笔劳务已保存并重新检查',
            );
          }}
        >
          <div className="form-grid">
            {(['name', 'organization', 'title', 'purpose'] as const).map((key) => (
              <label key={key}>
                {{ name: '姓名', organization: '单位', title: '职称', purpose: '事由' }[key]}
                {source(key)}
                <input
                  aria-label={
                    { name: '姓名', organization: '单位', title: '职称', purpose: '事由' }[key]
                  }
                  value={fields[key] ?? ''}
                  onChange={(e) => set(key, e.target.value || null)}
                />
              </label>
            ))}
            {select('affiliation', '校内 / 校外', { internal: '校内', external: '校外' })}
            {select('type', '劳务类型', LABOR_TYPES)}
            {select('mode', '形式', { online: '线上', offline: '线下' })}
            <label>
              具体日期{source('dates')}
              <textarea
                aria-label="具体日期"
                rows={3}
                value={datesText}
                placeholder="每行一个 YYYY-MM-DD"
                onChange={(e) => {
                  setDatesText(e.target.value);
                  set(
                    'dates',
                    e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((date) => ({
                        date,
                        precision: /^(?:\d{4}|-)-\d{2}$/.test(date) ? 'month' : 'day',
                      })),
                  );
                }}
              />
              <small>每行一个日期，例如 2026-08-01。月份不会自动补日。</small>
            </label>
            {(['quantity', 'unitPrice', 'total'] as const).map((key) => (
              <label key={key}>
                {{ quantity: '数量', unitPrice: '单价', total: '合计' }[key]}
                {source(key)}
                <input
                  aria-label={{ quantity: '数量', unitPrice: '单价', total: '合计' }[key]}
                  type="number"
                  min={0}
                  step="any"
                  value={fields[key] ?? ''}
                  onChange={(e) => set(key, e.target.value === '' ? null : e.target.valueAsNumber)}
                />
              </label>
            ))}
            {select(
              'unit',
              '数量单位',
              Object.fromEntries(LABOR_UNITS.map((unit) => [unit, unit])),
            )}
            {select(
              'priceUnit',
              '单价单位',
              Object.fromEntries(LABOR_UNITS.map((unit) => [unit, unit])),
            )}
            {select('studentLevel', '学生层次（论文评审 / 答辩）', {
              bachelor: '本科生',
              master: '硕士生',
              doctor: '博士生',
            })}
            {select('personnelRole', '监考人员类别', {
              teacher: '教师',
              administrative: '行政管理人员',
            })}
            {select('workTime', '监考时间', { work: '工作时间', holiday: '双休日、节假日' })}
            {(['nationalExpert', 'seniorStaff'] as const).map((key) => (
              <label key={key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft[key] ?? false}
                  onChange={(e) => set(key, e.target.checked)}
                />
                {key === 'nationalExpert' ? '全国知名专家' : '六级及以上职员'}
              </label>
            ))}
          </div>
          <div className="actions">
            <button className="primary" type="submit">
              保存本笔并重新检查
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft({});
                setDatesText(entry.parsed.dates.map((d) => d.date).join('\n'));
              }}
            >
              恢复解析字段（保存后生效）
            </button>
          </div>
        </form>
      </Collapsible>
      <Collapsible
        scope={view.report.dir}
        disclosureKey={entry.relativePath + ':standards'}
        title="适用标准"
        summary={entry.standards.map((row) => row.label).join('；') || '待补充条件'}
        level={3}
      >
        <p className="small muted">
          《西安交通大学评审费等项目开支管理办法》；横向和其他经费同时核对，具体口径以学校最新要求为准。
        </p>
        {entry.standards.map((s, n) => (
          <div key={n} className={'standard-row ' + s.position}>
            <span>{s.label}</span>
            <strong>
              {
                {
                  below: '↓ 低于下限',
                  within: '✓ 区间内',
                  above: '✗ 超过上限',
                  unknown: '? 单价待补',
                }[s.position]
              }
            </strong>
          </div>
        ))}
        {!entry.standards.length && <p>未确定适用标准，按上方问题补充条件；关闭 L3 时不检查。</p>}
        {entry.requirements.map((r) => (
          <div key={r.type}>
            {r.status === 'found' ? '✓ 已找到' : '✗ 缺失'} {r.label}
            {r.files.map((f) => (
              <FileLink key={f.path} file={f.path} run={run} />
            ))}
          </div>
        ))}
      </Collapsible>
      <Collapsible
        scope={view.report.dir}
        disclosureKey={entry.relativePath + ':attachments'}
        title="附件与发放表金额"
        summary={`${view.report.attachments.length} 个`}
        level={3}
      >
        <div className="labor-attachments">
          {view.report.attachments.map((a) => (
            <div key={a.path}>
              <FileLink file={a.path} run={run} />
              <span className="muted small">{a.label}</span>
            </div>
          ))}
          {!view.report.attachments.length && <p className="muted">未找到附件</p>}
        </div>
        <label>
          发放表金额 <small className="field-origin">手动</small>
          <input
            aria-label="发放表金额"
            type="number"
            min={0}
            step="any"
            value={draft.tableAmount ?? ''}
            onChange={(e) => {
              if (!e.target.value)
                setDraft((old) => {
                  const next = { ...old };
                  delete next.tableAmount;
                  return next;
                });
              else set('tableAmount', e.target.valueAsNumber);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() =>
            void run(
              async () =>
                update(await window.precheck.saveLabor(view.report.dir, entry.relativePath, draft)),
              '发放表金额已保存并重新检查',
            )
          }
        >
          保存发放表金额并重新检查
        </button>
      </Collapsible>
      <Collapsible
        scope={view.report.dir}
        disclosureKey={entry.relativePath + ':template'}
        title="生成规范情况说明"
        summary="预览、复制文本、导出 Word"
        level={3}
      >
        <label>
          规范情况说明预览
          <textarea aria-label="规范情况说明预览" rows={5} readOnly value={preview} />
        </label>
        <p className="small muted">
          请检查【待补充】字段、日期和事由后使用。导出会保存当前手填，且同名输出会覆盖。
        </p>
        <div className="actions">
          <button
            type="button"
            onClick={() => void run(() => window.precheck.copyText(preview), '情况说明已复制')}
          >
            复制文本
          </button>
          <button
            type="button"
            onClick={() =>
              void run(
                async () =>
                  update(
                    await window.precheck.exportLabor(view.report.dir, entry.relativePath, draft),
                  ),
                'Word 已导出到劳务目录的 _预检/',
              )
            }
          >
            导出 Word
          </button>
        </div>
      </Collapsible>
    </article>
  );
}
export function LaborPage({
  view,
  config,
  run,
  update,
  highlight,
}: {
  view: LaborView;
  config: RuleConfig;
  run: Run;
  update: (w: WorkspaceView) => void;
  highlight?: string;
}) {
  return (
    <RuleHelpProvider rules={config}>
      <CorrectionProvider dir={view.report.dir} run={run} update={update}>
        <main className="labor-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">独立劳务检查</div>
              <h1>{view.report.name}</h1>
              <p className="path">{view.report.dir}</p>
            </div>
            <div className="actions">
              <CorrectionAction global />
              <button
                onClick={() =>
                  void run(async () => update(await window.precheck.recheck(view.report.dir)))
                }
              >
                重新检查
              </button>
            </div>
          </div>
          <div className="compact-summary" data-testid="labor-summary">
            <strong>合计 ¥ {money(view.report.total)}</strong>
            <span>
              {view.report.payoutCount} 笔（{view.report.entries.length} 份说明）
            </span>
            <span>通过 {view.report.passed} 笔</span>
            <span>问题 {view.report.issueCount} 条</span>
          </div>
          {!!view.report.diagnostics.length && (
            <FindingList
              scope={view.report.dir}
              run={run}
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
            <p className="panel">
              没有可识别的情况说明。请提供有文字层的 PDF 或 .docx，正文或文件名包含“情况说明 /
              发放说明 / 说明”。
            </p>
          )}
          {view.report.entries.map((e, index) => (
            <LaborCard
              ordinal={index + 1}
              key={e.relativePath}
              entry={e}
              view={view}
              config={config}
              run={run}
              update={update}
              highlight={highlight}
            />
          ))}
          {!view.report.entries.length && (
            <section>
              <h2>附件</h2>
              {view.report.attachments.map((a) => (
                <div key={a.path}>
                  <FileLink file={a.path} run={run} />
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
              <FileLink key={file} file={file} run={run} />
            ))}
            <button onClick={() => void run(() => window.precheck.openOutput(view.report.dir))}>
              打开输出文件夹
            </button>
            <ReplacementRecords
              history={view.replacements}
              dir={view.report.dir}
              run={run}
              update={update}
            />
          </Collapsible>
        </main>
      </CorrectionProvider>
    </RuleHelpProvider>
  );
}
