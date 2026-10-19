import { useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/api.js';
import { loadConfig, type RuleConfig } from '../../core/rules/config.js';
import {
  ATTACHMENT_CATALOG,
  GROUP_CATALOG,
  EXPENSE_CATALOG,
  GENERAL_CATALOG,
  LABOR_CATALOG,
  type ConfigField,
  type RuleDefinition,
} from '../../core/rules/catalog.js';
import { ConfigFieldEditor, getConfigValue, setConfigValue } from './ConfigField.js';
import { Collapsible } from './Collapsible.js';
import { RulesOverview, type RuleFocus } from './RulesOverview.js';
import { ConfigFieldDisclosure } from './ConfigField.js';
import { FeedbackPanel } from './Feedback.js';
import { RuleVersion } from './RuleVersion.js';
import type { RuleVersionInfo } from '../../shared/feedback.js';
import type { Run } from './ui.js';

const tabs = [
  '规则',
  '劳务标准',
  '附件识别',
  '分组',
  '支出内容',
  '通用',
  '高级（JSON）',
  '反馈',
] as const;
export function Settings({
  initial,
  userData,
  run,
  changed,
  focusRule,
  version,
}: {
  initial: AppSettings;
  userData: string;
  run: Run;
  changed: (value: AppSettings) => Promise<void>;
  focusRule?: RuleFocus | null;
  version?: RuleVersionInfo;
}) {
  const [draft, setDraft] = useState<AppSettings>(structuredClone(initial));
  const [json, setJson] = useState(JSON.stringify(initial.rules, null, 2));
  const [tab, setTab] = useState<(typeof tabs)[number]>('规则');
  const scope = 'settings:' + userData;
  useEffect(() => {
    if (focusRule) setTab('规则');
  }, [focusRule]);
  const replace = (settings: AppSettings) => {
    setDraft(settings);
    setJson(JSON.stringify(settings.rules, null, 2));
  };
  const edit = (path: string, value: unknown) => {
    const next = structuredClone(draft);
    setConfigValue(next.rules, path, value);
    replace(next);
  };
  const accept = async (settings: AppSettings | null) => {
    if (!settings) return;
    replace(settings);
    await changed(settings);
  };
  const fields = (items: ConfigField[]) =>
    items.map((field) => (
      <ConfigFieldEditor
        key={field.path}
        field={field}
        value={getConfigValue(draft.rules, field.path)}
        change={(value) => edit(field.path, value)}
      />
    ));
  const foldedFields = (items: ConfigField[]) =>
    items.map((field) => (
      <ConfigFieldDisclosure
        key={field.path}
        scope={scope}
        field={field}
        value={getConfigValue(draft.rules, field.path)}
        change={(value) => edit(field.path, value)}
      />
    ));
  const restoreRule = (rule: RuleDefinition) => {
    const defaults = loadConfig();
    const next = structuredClone(draft);
    for (const field of rule.config)
      setConfigValue(next.rules, field.path, structuredClone(getConfigValue(defaults, field.path)));
    replace(next);
  };
  const save = () =>
    void run(
      async () =>
        accept(await window.precheck.saveSettings({ ...draft, rules: loadConfig(draft.rules) })),
      '设置已保存，工作区已重新检查',
    );
  return (
    <main className="settings">
      <div className="page-heading">
        <div>
          <div className="eyebrow">本机配置</div>
          <h1>设置</h1>
          <p>保存后重新检查全部批次。同名配置项在规则之间共享；关键字按回车添加，× 删除。</p>
        </div>
      </div>
      <RuleVersion version={version} settings={initial} rulesChanged={accept} run={run} />
      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        {tabs.map((name) => (
          <button
            type="button"
            role="tab"
            key={name}
            aria-selected={tab === name}
            aria-controls="settings-content"
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div id="settings-content" role="tabpanel" aria-label={tab}>
          {tab === '反馈' && <FeedbackPanel run={run} />}
          {tab === '规则' && (
            <RulesOverview
              rules={draft.rules}
              scope={scope}
              edit={edit}
              restore={restoreRule}
              focusRule={focusRule}
            />
          )}
          {tab === '附件识别' && (
            <div className="panel catalog-fields">{foldedFields(ATTACHMENT_CATALOG)}</div>
          )}
          {tab === '劳务标准' && (
            <div className="panel catalog-fields">
              <p>
                标准来源：《西安交通大学评审费等项目开支管理办法》。通讯按每人每次，线下按半天或天；咨询同时比较横向及其他经费。修改后保存并重新检查。
              </p>
              <Collapsible
                scope={scope}
                disclosureKey="labor-consultation"
                title="咨询费"
                summary={`${draft.rules.laborStandards.consultation.length} 条标准 · 1 个模板`}
              >
                {fields(
                  LABOR_CATALOG.filter(
                    (f) =>
                      f.path === 'laborStandards.consultation' ||
                      f.path === 'labor.templates.consultation',
                  ),
                )}
              </Collapsible>
              <Collapsible
                scope={scope}
                disclosureKey="labor-other"
                title="其他劳务费"
                summary={`${draft.rules.laborStandards.other.length} 条标准`}
              >
                {fields(
                  LABOR_CATALOG.filter(
                    (f) =>
                      f.path !== 'laborStandards.consultation' &&
                      f.path !== 'labor.templates.consultation',
                  ),
                )}
              </Collapsible>
              <p className="small muted">
                模板变量：
                {
                  '{单位} {姓名} {职称} {日期列表} {事由} {形式} {数量} {单位词} {单价单位词} {单价} {合计}'
                }
                。
              </p>
            </div>
          )}
          {tab === '分组' && (
            <div className="panel catalog-fields">{foldedFields(GROUP_CATALOG)}</div>
          )}
          {tab === '支出内容' && (
            <div className="panel catalog-fields">{foldedFields(EXPENSE_CATALOG)}</div>
          )}
          {tab === '通用' && (
            <div className="panel catalog-fields">
              {fields(GENERAL_CATALOG)}
              <label>
                中行历史牌价地址
                <input
                  type="url"
                  required
                  value={draft.bocUrl}
                  onChange={(e) => setDraft({ ...draft, bocUrl: e.target.value })}
                />
              </label>
              <p className="muted small">
                只接受 HTTPS 中行域名。理由库草稿须按实际用途和寿命核对。
              </p>
            </div>
          )}
          {tab === '高级（JSON）' && (
            <div className="panel advanced">
              <h2>完整规则 JSON</h2>
              <p>与表单使用同一配置；校验失败不会覆盖已保存设置。</p>
              <textarea
                aria-label="完整规则 JSON"
                rows={24}
                spellCheck={false}
                value={json}
                onChange={(e) => setJson(e.target.value)}
              />
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const value = loadConfig(JSON.parse(json) as RuleConfig);
                    await accept(await window.precheck.saveSettings({ ...draft, rules: value }));
                  }, '高级规则已保存，工作区已重新检查')
                }
              >
                校验并保存 JSON
              </button>
            </div>
          )}
        </div>
        <div className="actions settings-actions" hidden={tab === '反馈'}>
          {tab !== '高级（JSON）' && (
            <button className="primary" type="submit">
              保存设置
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              void run(async () => accept(await window.precheck.importRules()), '规则已导入并校验')
            }
          >
            导入规则 JSON
          </button>
          <button type="button" onClick={() => void run(() => window.precheck.exportRules(draft))}>
            导出规则 JSON
          </button>
          <button
            type="button"
            onClick={() =>
              void run(async () => accept(await window.precheck.resetSettings()), '已恢复默认设置')
            }
          >
            恢复全部默认
          </button>
        </div>
      </form>
      <p className="path small">
        本机数据目录：{userData}
        <br />
        feedback.json：反馈标记；rules-state.json：默认规则快照与导入来源；settings.json：设置；history.json：提交历史；recent.json：最近目录；workspace.json：工作区和布局。批次内
        _预检/ 保留手填与输出，不上传。
      </p>
    </main>
  );
}
