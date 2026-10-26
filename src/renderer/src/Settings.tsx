import styles from './settings/settings.module.css';
import uiStyles from './styles/ui.module.css';
import { PageHeader } from './ui.js';
import { useWorkspaceStore } from './store/workspace.js';
import { useRuleFocus } from './store/route.js';
import { useRun } from './store/status.js';
import { useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/api.js';
import { loadConfig, type RuleConfig } from '../../core/rules/config.js';
import type { RuleDefinition } from '../../core/rules/catalog.js';
import { getConfigValue, setConfigValue } from './ConfigField.js';
import { Tabs } from 'radix-ui';
import { SettingsContent } from './settings/SettingsContent.js';
import { SettingsActions } from './settings/SettingsActions.js';
import { RuleVersion } from './RuleVersion.js';
import type { RuleVersionInfo } from '../../shared/feedback.js';

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
  version,
}: {
  initial: AppSettings;
  userData: string;
  version?: RuleVersionInfo;
}) {
  const run = useRun();
  const changed = useWorkspaceStore((state) => state.changeSettings);
  const focusRule = useRuleFocus();
  const [draft, setDraft] = useState<AppSettings>(structuredClone(initial));
  const [json, setJson] = useState(JSON.stringify(initial.rules, null, 2));
  const [tab, setTab] = useState<(typeof tabs)[number]>('规则');
  const savedSettings = useWorkspaceStore((state) => state.boot?.settings);
  useEffect(() => {
    if (savedSettings) {
      setDraft(structuredClone(savedSettings));
      setJson(JSON.stringify(savedSettings.rules, null, 2));
    }
  }, [savedSettings]);
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
    <Tabs.Root
      value={tab}
      onValueChange={(value) => setTab(value as (typeof tabs)[number])}
      asChild
    >
      <main className={styles.settings}>
        <PageHeader
          title="设置"
          subtitle="保存后重新检查全部批次。同名配置项在规则之间共享；关键字按回车添加，× 删除。"
        />
        <RuleVersion version={version} settings={initial} />
        <Tabs.List className={styles.settingsTabs} aria-label="设置分类">
          {tabs.map((name) => (
            <Tabs.Trigger type="button" value={name} key={name} aria-controls="settings-content">
              {name}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Tabs.Content id="settings-content" value={tab} aria-label={tab}>
            <SettingsContent
              tab={tab}
              rules={draft.rules}
              scope={scope}
              edit={edit}
              restoreRule={restoreRule}
              bocUrl={draft.bocUrl}
              setBocUrl={(bocUrl) => setDraft({ ...draft, bocUrl })}
              json={json}
              setJson={setJson}
              saveJson={() =>
                void run(async () => {
                  const value = loadConfig(JSON.parse(json) as RuleConfig);
                  await accept(await window.precheck.saveSettings({ ...draft, rules: value }));
                }, '高级规则已保存，工作区已重新检查')
              }
            />
          </Tabs.Content>
          <SettingsActions tab={tab} draft={draft} accept={accept} />
        </form>
        <p className={uiStyles.path + ' ' + uiStyles.small}>
          本机数据目录：{userData}
          <br />
          feedback.json：反馈标记；rules-state.json：默认规则快照与导入来源；settings.json：设置；history.json：提交历史；recent.json：最近目录；workspace.json：工作区和布局。批次内
          _预检/ 保留手填与输出，不上传。
        </p>
      </main>
    </Tabs.Root>
  );
}
