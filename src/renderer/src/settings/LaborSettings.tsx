import styles from '../styles/ui.module.css';
import settingsFieldsStyles from './fields.module.css';
import { Collapsible } from '../Collapsible.js';
import type { RuleConfig } from '../../../core/rules/config.js';
import { LABOR_CATALOG, type ConfigField } from '../../../core/rules/catalog.js';
import { ConfigCatalog } from './ConfigCatalog.js';

export function LaborSettings({
  rules,
  scope,
  edit,
}: {
  rules: RuleConfig;
  scope: string;
  edit: (path: string, value: unknown) => void;
}) {
  const catalog = (items: ConfigField[]) => (
    <ConfigCatalog items={items} rules={rules} scope={scope} edit={edit} />
  );
  return (
    <div className={styles.panel + ' ' + settingsFieldsStyles.catalogFields}>
      <p>
        标准来源：《西安交通大学评审费等项目开支管理办法》。通讯按每人每次，线下按半天或天；咨询同时比较横向及其他经费。修改后保存并重新检查。
      </p>
      <Collapsible
        scope={scope}
        disclosureKey="labor-consultation"
        title="咨询费"
        summary={`${rules.laborStandards.consultation.length} 条标准 · 1 个模板`}
      >
        {catalog(
          LABOR_CATALOG.filter(
            (f) =>
              f.path === 'laborStandards.consultation' || f.path === 'labor.templates.consultation',
          ),
        )}
      </Collapsible>
      <Collapsible
        scope={scope}
        disclosureKey="labor-other"
        title="其他劳务费"
        summary={`${rules.laborStandards.other.length} 条标准`}
      >
        {catalog(
          LABOR_CATALOG.filter(
            (f) =>
              f.path !== 'laborStandards.consultation' && f.path !== 'labor.templates.consultation',
          ),
        )}
      </Collapsible>
      <p className={styles.small + ' ' + styles.muted}>
        模板变量：
        {'{单位} {姓名} {职称} {日期列表} {事由} {形式} {数量} {单位词} {单价单位词} {单价} {合计}'}
        。
      </p>
    </div>
  );
}
