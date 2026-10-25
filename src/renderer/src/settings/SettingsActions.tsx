import styles from '../styles/ui.module.css';
import settingsSettingsStyles from './settings.module.css';
import type { AppSettings } from '../../../shared/api.js';
import { useRun } from '../store/status.js';

export function SettingsActions({
  tab,
  draft,
  accept,
}: {
  tab: string;
  draft: AppSettings;
  accept: (settings: AppSettings | null) => Promise<void>;
}) {
  const run = useRun();
  return (
    <div
      className={styles.actions + ' ' + settingsSettingsStyles.settingsActions}
      hidden={tab === '反馈'}
    >
      {tab !== '高级（JSON）' && (
        <button className={styles.primary} type="submit">
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
  );
}
