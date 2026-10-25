import { useWorkspaceStore } from './store/workspace.js';
import { useRun } from './store/status.js';
import { useEffect, useState } from 'react';
import type { RuleVersionInfo, UpgradeChoices } from '../../shared/feedback.js';
import type { AppSettings } from '../../shared/api.js';
import { FeedbackDialog } from './Feedback.js';
export function ruleVersionLabel(version: RuleVersionInfo): string {
  return (
    `规则：默认 v${version.defaultsHash.slice(0, 8)}` +
    (version.customized ? ` · 已自定义 ${version.customized} 项` : '') +
    (version.imported
      ? ` · 导入自 ${version.imported.file} ${version.imported.importedAt.slice(0, 10)}`
      : '')
  );
}
export function RuleVersion({
  version,
  settings,
}: {
  version?: RuleVersionInfo;
  settings: AppSettings;
}) {
  const run = useRun();
  const rulesChanged = useWorkspaceStore((state) => state.changeSettings);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<UpgradeChoices>({});
  useEffect(() => setChoices({}), [version?.upgrade?.toHash]);
  if (!version) return null;
  return (
    <div className="rule-version">
      <p className="muted small">{ruleVersionLabel(version)}</p>
      {version.upgrade && (
        <button type="button" className="version-banner" onClick={() => setOpen(true)}>
          有新的默认规则 · 查看差异
        </button>
      )}
      {open && version.upgrade && (
        <FeedbackDialog title="有新的默认规则" close={() => setOpen(false)}>
          <p>每项选择采用新默认或保留当前值；未确认前继续使用你的当前配置。</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>配置路径</th>
                  <th>旧默认</th>
                  <th>新默认</th>
                  <th>你的当前值</th>
                  <th>选择</th>
                </tr>
              </thead>
              <tbody>
                {version.upgrade.items.map((item) => (
                  <tr key={item.path}>
                    <td className="path">{item.path}</td>
                    <td>
                      <pre>{JSON.stringify(item.oldDefault, null, 2)}</pre>
                    </td>
                    <td>
                      <pre>{JSON.stringify(item.newDefault, null, 2)}</pre>
                    </td>
                    <td>
                      <pre>{JSON.stringify(item.currentValue, null, 2)}</pre>
                    </td>
                    <td>
                      <select
                        aria-label={item.path + ' 升级选择'}
                        value={choices[item.path] ?? ''}
                        onChange={(e) =>
                          setChoices({
                            ...choices,
                            [item.path]: e.target.value as 'default' | 'mine',
                          })
                        }
                      >
                        <option value="" disabled>
                          请选择
                        </option>
                        <option value="default">采用新默认</option>
                        <option value="mine">保留我的</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={version.upgrade.items.some((i) => !choices[i.path])}
              onClick={() =>
                void run(async () => {
                  const result = await window.precheck.resolveRuleUpgrade(choices);
                  await rulesChanged({ ...settings, rules: result.rules });
                  setOpen(false);
                }, '规则选择已保存，工作区已重新检查')
              }
            >
              保存选择
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              稍后处理
            </button>
          </div>
        </FeedbackDialog>
      )}
    </div>
  );
}
