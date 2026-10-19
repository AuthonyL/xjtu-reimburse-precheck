import { useState } from 'react';
import type { BatchView, WorkspaceView } from '../../shared/api.js';
import { FileLink, money, type Run } from './ui.js';

export function RejectedPage({
  view,
  run,
  update,
}: {
  view: BatchView;
  run: Run;
  update: (workspace: WorkspaceView) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  return (
    <main className="rejected-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">拒票参考</div>
          <h1>无法报销费用</h1>
          <p className="path">{view.batch.dir}</p>
        </div>
      </div>
      <p className="muted">
        可能原因由当前规则推断，不代表财务原结论。仅保存原因到
        _预检/reasons.json，其余内容保持只读。
      </p>
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              {['文件', '品名', '金额', '原因', '操作'].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.batch.invoices.map((invoice) => {
              const info = view.rejectedInfo?.find((r) => r.number === invoice.number);
              return (
                <tr key={invoice.number} data-testid="rejected-row">
                  <td>
                    {invoice.sources.map((file) => (
                      <FileLink key={file.path} file={file.path} run={run} />
                    ))}
                  </td>
                  <td>{invoice.lines.map((line) => line.name).join('；') || '未读取到明细'}</td>
                  <td className="numeric">
                    {invoice.currency} {money(invoice.total)}
                  </td>
                  <td>
                    {info?.recorded ? (
                      <div className="recorded-reason">
                        {info.recorded.reason}
                        <p className="muted small">
                          记录于 {info.recorded.recordedAt.slice(0, 10)}
                        </p>
                      </div>
                    ) : info?.inferred.length ? (
                      <span className="inferred-reason">
                        可能：{info.inferred.map((r) => r.ruleId + ' ' + r.name).join('、')}
                      </span>
                    ) : (
                      <span className="muted">未记录</span>
                    )}
                    {editing === invoice.number && (
                      <form
                        className="reason-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            update(
                              await window.precheck.saveRejectedReason(invoice.number, reason),
                            );
                            setEditing(null);
                          }, '拒票原因已保存，相关批次提示已更新');
                        }}
                      >
                        <label>
                          拒票原因
                          <textarea
                            aria-label="拒票原因"
                            required
                            maxLength={10000}
                            rows={4}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <div className="actions">
                          <button className="primary" type="submit">
                            保存原因
                          </button>
                          <button type="button" onClick={() => setEditing(null)}>
                            取消
                          </button>
                        </div>
                      </form>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        setEditing(invoice.number);
                        setReason(info?.recorded?.reason ?? '');
                      }}
                    >
                      {info?.recorded ? '修改' : '记录原因'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!view.batch.invoices.length && (
        <p className="panel muted">
          没有可识别发票。未识别文件可在下方打开核对；没有发票号时无法按号码记录原因。
        </p>
      )}
      {!!view.batch.unidentified.length && (
        <section>
          <h2>未识别文件</h2>
          <div className="panel">
            {view.batch.unidentified.map((file) => (
              <FileLink key={file.path} file={file.path} run={run} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
