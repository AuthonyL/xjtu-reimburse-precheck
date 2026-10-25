import styles from '../styles/ui.module.css';
import settingsFieldsStyles from './fields.module.css';
import settingsSettingsStyles from './settings.module.css';
import type { RuleConfig } from '../../../core/rules/config.js';
import {
  ATTACHMENT_CATALOG,
  GROUP_CATALOG,
  EXPENSE_CATALOG,
  GENERAL_CATALOG,
  type ConfigField,
  type RuleDefinition,
} from '../../../core/rules/catalog.js';
import { RulesOverview } from '../RulesOverview.js';
import { FeedbackPanel } from '../Feedback.js';
import { ConfigCatalog } from './ConfigCatalog.js';
import { LaborSettings } from './LaborSettings.js';

export function SettingsContent({
  tab,
  rules,
  scope,
  edit,
  restoreRule,
  bocUrl,
  setBocUrl,
  json,
  setJson,
  saveJson,
}: {
  tab: string;
  rules: RuleConfig;
  scope: string;
  edit: (path: string, value: unknown) => void;
  restoreRule: (rule: RuleDefinition) => void;
  bocUrl: string;
  setBocUrl: (url: string) => void;
  json: string;
  setJson: (value: string) => void;
  saveJson: () => void;
}) {
  const catalog = (items: ConfigField[]) => (
    <ConfigCatalog items={items} rules={rules} scope={scope} edit={edit} />
  );
  const foldedCatalog = (items: ConfigField[]) => (
    <ConfigCatalog items={items} rules={rules} scope={scope} edit={edit} folded />
  );
  return (
    <>
      {tab === '反馈' && <FeedbackPanel />}
      {tab === '规则' && (
        <RulesOverview rules={rules} scope={scope} edit={edit} restore={restoreRule} />
      )}
      {tab === '附件识别' && (
        <div className={styles.panel + ' ' + settingsFieldsStyles.catalogFields}>
          {foldedCatalog(ATTACHMENT_CATALOG)}
        </div>
      )}
      {tab === '劳务标准' && <LaborSettings rules={rules} scope={scope} edit={edit} />}
      {tab === '分组' && (
        <div className={styles.panel + ' ' + settingsFieldsStyles.catalogFields}>
          {foldedCatalog(GROUP_CATALOG)}
        </div>
      )}
      {tab === '支出内容' && (
        <div className={styles.panel + ' ' + settingsFieldsStyles.catalogFields}>
          {foldedCatalog(EXPENSE_CATALOG)}
        </div>
      )}
      {tab === '通用' && (
        <div className={styles.panel + ' ' + settingsFieldsStyles.catalogFields}>
          {catalog(GENERAL_CATALOG)}
          <label>
            中行历史牌价地址
            <input type="url" required value={bocUrl} onChange={(e) => setBocUrl(e.target.value)} />
          </label>
          <p className={styles.muted + ' ' + styles.small}>
            只接受 HTTPS 中行域名。理由库草稿须按实际用途和寿命核对。
          </p>
        </div>
      )}
      {tab === '高级（JSON）' && (
        <div className={styles.panel + ' ' + settingsSettingsStyles.advanced}>
          <h2>完整规则 JSON</h2>
          <p>与表单使用同一配置；校验失败不会覆盖已保存设置。</p>
          <textarea
            aria-label="完整规则 JSON"
            rows={24}
            spellCheck={false}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <button type="button" onClick={saveJson}>
            校验并保存 JSON
          </button>
        </div>
      )}
    </>
  );
}
