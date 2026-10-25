import { RuleHelpProvider } from './RuleHelp.js';
import { Collapsible } from './Collapsible.js';
import { useDisclosures } from './disclosures.js';
import type { BatchView, WorkspaceView, AppSettings } from '../../shared/api.js';
import { Counts, FileLink, materialNames, money, type Run } from './ui.js';
import { ManualForm } from './ManualForm.js';
import { Findings } from './Findings.js';
import { INVOICE_TYPE_LABELS } from '../../core/rules/catalog.js';
import { groupAnchor } from '../../shared/navigation.js';
import { CorrectionProvider, CorrectionAction, ReplacementRecords } from './SingleFileCheck.js';
import { ClaimStatus } from './ClaimStatus.js';

export function Results({
  view,
  run,
  update,
  back,
  settings,
  highlight,
  locate,
}: {
  view: BatchView;
  run: Run;
  update: (view: WorkspaceView) => void;
  back: () => void;
  settings?: AppSettings;
  highlight?: string;
  locate?: (group: string) => void;
}) {
  const { batch, report } = view;
  const [expandedGroups, setExpandedGroups] = useDisclosures(batch.dir, 'groups');
  const groupNames = [...report.groups.map((g) => g.group.name), '根目录'];
  const apply = (fn: () => Promise<WorkspaceView>, notice?: string) =>
    void run(async () => update(await fn()), notice);
  const invoiceRows = report.groups.flatMap((g) => g.invoices.map((i) => ({ g, i })));
  const pending = view.manualTasks.filter((t) => t.pending).length;
  return (
    <RuleHelpProvider rules={settings?.rules}>
      <CorrectionProvider dir={batch.dir} run={run} update={update} disabled={!!view.readOnly}>
        <main className="results">
          <div className="results-toolbar">
            <button className="text-button" onClick={back}>
              ← 批次总览
            </button>
            <strong>{batch.id}</strong>
            <ClaimStatus key={batch.dir} view={view} run={run} update={update} />
            {!view.readOnly && (
              <div className="actions">
                <CorrectionAction global />
                <button onClick={() => apply(() => window.precheck.recheck(batch.dir))}>
                  重新检查
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    apply(
                      () => window.precheck.exportBatch(batch.dir),
                      '导出完成，可在下方打开文件',
                    )
                  }
                >
                  导出到批次文件夹
                </button>
                <button onClick={() => void run(() => window.precheck.openOutput(batch.dir))}>
                  打开输出文件夹
                </button>
              </div>
            )}
          </div>
          <div className="summary-strip panel" data-testid="batch-summary">
            <div className="summary-line">
              <strong>人民币合计 ¥ {money(report.totalCny)}</strong>
              <span>
                {report.invoiceCount} 张发票 · 待手填 {pending} 项
              </span>
              <Counts report={report} />
            </div>
            <div className="summary-line">
              {report.totals.map((t) => (
                <span key={t.expenseContent}>
                  {t.expenseContent} ¥ {money(t.amount)}
                </span>
              ))}
              <span className="muted">
                {batch.submitted ? '✓ 已有学校报销单' : '未找到学校报销单'}
              </span>
            </div>
            {batch.submitted && ['draft', 'ready'].includes(view.claim.state) && (
              <p className="muted">已找到学校报销单，可标记为已提交</p>
            )}
            {(report.unconverted.length > 0 || report.deferredGroups.length > 0) && (
              <details className="small">
                <summary>
                  未折算 {report.unconverted.length} 张 · 暂缓 {report.deferredGroups.length}{' '}
                  组（均不计合计）
                </summary>
                {report.unconverted.map(({ invoice }) => (
                  <p key={invoice.number}>
                    {invoice.seller.name} · {invoice.currency} {money(invoice.total)} ·{' '}
                    {invoice.number}
                  </p>
                ))}
                {report.deferredGroups.map((g) => (
                  <p key={g.group.id}>
                    暂缓组 {g.group.name} · ¥ {money(g.totalCny)}
                    {g.unconverted.length ? ` · 另有 ${g.unconverted.length} 张未折算` : ''}
                  </p>
                ))}
              </details>
            )}
            <p className="path small">{batch.dir}</p>
          </div>
          <Findings
            scope={batch.dir}
            report={report}
            run={run}
            locate={locate}
            waivers={view.claim.waivers}
            waive={
              view.readOnly
                ? undefined
                : async (id, reason) =>
                    update(await window.precheck.waiveFinding(batch.dir, id, reason))
            }
            unwaive={
              view.readOnly
                ? undefined
                : async (id) => update(await window.precheck.unwaiveFinding(batch.dir, id))
            }
          />
          <section aria-label="分组与材料">
            <div className="section-heading">
              <h2>分组与材料</h2>
              <div className="disclosure-actions">
                <button className="text-button" onClick={() => setExpandedGroups(groupNames, true)}>
                  全部展开
                </button>
                <button
                  className="text-button"
                  onClick={() => setExpandedGroups(groupNames, false)}
                >
                  全部收起
                </button>
              </div>
              <span className="muted">
                需要 {report.requirementCounts.total} · ✓ 已找到 {report.requirementCounts.found} ·
                ? 待确认 {report.requirementCounts.unconfirmed} · ✗ 缺失{' '}
                {report.requirementCounts.missing}
              </span>
            </div>
            {!report.groups.some((g) => g.group.name === '根目录') && (
              <article
                id={groupAnchor('根目录')}
                data-testid="group-根目录"
                className={'group-card panel' + (highlight === '根目录' ? ' group-highlight' : '')}
              >
                <button
                  className="group-summary"
                  aria-expanded={!!expandedGroups['根目录']}
                  aria-controls={groupAnchor('根目录') + '-details'}
                  onClick={() => setExpandedGroups(['根目录'], !expandedGroups['根目录'])}
                >
                  <span className="group-name">根目录</span>
                  <span className="group-material-counts">✓ 0 · ? 0 · ✗ 0</span>
                  <span className="disclosure-chevron">{expandedGroups['根目录'] ? '▾' : '▸'}</span>
                </button>
                {expandedGroups['根目录'] && (
                  <p id={groupAnchor('根目录') + '-details'} className="muted">
                    本批次没有根目录散票。
                  </p>
                )}
              </article>
            )}
            {report.groups.map((g) => {
              const counts = { found: 0, unconfirmed: 0, missing: 0 };
              g.requirements.forEach((r) => counts[r.status]++);
              const expanded = expandedGroups[g.group.name] ?? false;
              const detailsId = groupAnchor(g.group.name) + '-details';
              return (
                <article
                  className={
                    'group-card panel' + (highlight === g.group.name ? ' group-highlight' : '')
                  }
                  id={groupAnchor(g.group.name)}
                  key={g.group.id}
                  data-testid={'group-' + g.group.name}
                >
                  <button
                    className="group-summary"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    onClick={() => setExpandedGroups([g.group.name], !expanded)}
                  >
                    <span className="group-name" title={g.group.name}>
                      {g.group.name}
                    </span>
                    <span className="tags group-flags">
                      {Object.entries(g.group.flags)
                        .filter(([, value]) => value)
                        .map(([key]) => (
                          <span className="pill" key={key}>
                            {
                              {
                                deferred: '暂缓',
                                bankTransfer: '公转',
                                outsourced: '委托',
                                ai: 'AI',
                              }[key]
                            }
                          </span>
                        ))}
                    </span>
                    <span className="group-expense" title={g.expenseContent}>
                      {g.expenseContent}
                    </span>
                    <span className="group-total">
                      ¥ {money(g.totalCny)}
                      {g.unconverted.length ? ` + ${g.unconverted.length} 张未折算` : ''}
                    </span>
                    <span className="group-material-counts" title="已找到 · 待确认 · 缺失">
                      ✓ {counts.found} · ? {counts.unconfirmed} · ✗ {counts.missing}
                    </span>
                    <span className="disclosure-chevron" aria-hidden="true">
                      {expanded ? '▾' : '▸'}
                    </span>
                  </button>
                  {expanded && (
                    <div id={detailsId} className="group-details">
                      {g.requirements.length ? (
                        g.requirements.map((r, index) => (
                          <div
                            className="requirement"
                            key={r.type + index}
                            data-testid={'requirement-' + r.type}
                          >
                            <div className={'requirement-status ' + r.status}>
                              {
                                { found: '✓ 已找到', unconfirmed: '? 待确认', missing: '✗ 缺失' }[
                                  r.status
                                ]
                              }
                            </div>
                            <div className="requirement-content">
                              <strong>{materialNames[r.type]}</strong>
                              <span className="rule-tag">{r.ruleIds.join(' / ')}</span>
                              <p>{r.reason}</p>
                              {r.status !== 'found' && !view.readOnly && (
                                <CorrectionAction
                                  material={{ groupId: g.group.id, type: r.type }}
                                />
                              )}
                              {r.note && <p className="muted small">{r.note}</p>}
                              {r.foundFiles.map((f) => (
                                <FileLink key={f.path} file={f.path} run={run} />
                              ))}
                              {r.candidateFiles.map((f) => (
                                <div className="candidate" key={f.path}>
                                  <FileLink file={f.path} run={run} />
                                  {!view.readOnly && (
                                    <button
                                      onClick={() =>
                                        apply(
                                          () =>
                                            window.precheck.confirmAttachment(
                                              batch.dir,
                                              f.relativePath,
                                              r.type,
                                            ),
                                          '附件类型已确认',
                                        )
                                      }
                                    >
                                      是{materialNames[r.type]}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="muted">此组未触发材料要求。</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
          <Collapsible
            scope={batch.dir}
            disclosureKey="invoices"
            title="发票明细"
            summary={`${invoiceRows.length} 张 · ¥ ${money(report.totalCny)}`}
            testId="section-invoices"
          >
            <div className="table-scroll panel">
              <table aria-label="发票明细">
                <thead>
                  <tr>
                    {[
                      '序号',
                      '号码',
                      '票种',
                      '开票 / 支付日期',
                      '销方',
                      '价税合计',
                      '币种',
                      '支出内容',
                      '所在组',
                      '来源文件',
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map(({ g, i }, index) => (
                    <tr key={g.group.id + i.invoice.number}>
                      <td>{index + 1}</td>
                      <td className="number">{i.invoice.number}</td>
                      <td>{INVOICE_TYPE_LABELS[i.invoice.invoiceType]}</td>
                      <td>{i.invoice.date || '待填'}</td>
                      <td>{i.invoice.seller.name}</td>
                      <td className="numeric">{money(i.invoice.total)}</td>
                      <td>{i.invoice.currency}</td>
                      <td>{i.expenseContent}</td>
                      <td>{g.group.name}</td>
                      <td>
                        {i.invoice.sources
                          .filter(
                            (s) =>
                              s.format !== 'manual' ||
                              batch.manual.entries.some((e) => e.sourceFile === s.relativePath),
                          )
                          .map((s) => (
                            <FileLink key={s.path} file={s.path} run={run} />
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapsible>
          {!view.readOnly && (
            <Collapsible
              scope={batch.dir}
              disclosureKey="manual"
              title="手填与汇率"
              summary={`待手填 ${pending} 项`}
              attention={pending > 0}
              testId="section-manual"
            >
              <p className="muted">
                保存后重新检查。每张海外收据单独填写；未读取到收据的 AI 组可按实际支付记录补录。
              </p>
              {view.manualTasks.length ? (
                view.manualTasks.map((task) => (
                  <ManualForm
                    key={task.key + JSON.stringify(task.entry)}
                    task={{
                      ...task,
                      entry: { exchangeRateType: settings?.rules.exchangeRateType, ...task.entry },
                    }}
                    dir={batch.dir}
                    run={run}
                    update={update}
                  />
                ))
              ) : (
                <p className="panel muted">当前没有需要补录的海外收据或 AI 组。</p>
              )}
            </Collapsible>
          )}
          <Collapsible
            scope={batch.dir}
            disclosureKey="outputs"
            title="输出文件"
            summary={`${view.outputs.length} 个 · 替换记录 ${view.replacements?.records.length ?? 0} 条`}
            testId="export-list"
          >
            {view.outputs.length ? (
              <div className="panel">
                {view.outputs.map((file) => (
                  <FileLink file={file} key={file} run={run} />
                ))}
              </div>
            ) : (
              <p className="muted">导出后保存在本批次的 _预检 文件夹。</p>
            )}
            {!view.readOnly && (
              <ReplacementRecords
                history={view.replacements}
                dir={batch.dir}
                run={run}
                update={update}
              />
            )}
          </Collapsible>
        </main>
      </CorrectionProvider>
    </RuleHelpProvider>
  );
}
