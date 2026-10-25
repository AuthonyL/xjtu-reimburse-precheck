import { useRouteStore } from './store/route.js';
import { createContext, useContext, type ReactNode } from 'react';
import type { Finding } from '../../core/types.js';
import { loadConfig, type RuleConfig } from '../../core/rules/config.js';
import { criteria, ruleDefinition, ruleMeaning } from '../../core/rules/catalog.js';
const defaultRules = loadConfig();
const Context = createContext<{ rules: RuleConfig }>({
  rules: defaultRules,
});
export function RuleHelpProvider({ rules, children }: { rules?: RuleConfig; children: ReactNode }) {
  const parent = useContext(Context);
  return <Context.Provider value={{ rules: rules ?? parent.rules }}>{children}</Context.Provider>;
}
export function ruleTitle(ids: string): string {
  return ids
    .split('/')
    .map(
      (id) =>
        `${id} · ${ruleMeaning(id).split(' = ')[1]} · ${ruleDefinition(id)?.name ?? '系统检查'}`,
    )
    .join('\n');
}
export function RuleHelp({ finding }: { finding: Finding }) {
  const { rules } = useContext(Context);
  const navigate = useRouteStore((state) => state.navigate);
  const openRule = (id: string) => navigate({ page: 'rules', ruleId: id });
  return (
    <div className="rule-help" role="region" aria-label="规则说明">
      <h4>规则说明</h4>
      {finding.ruleId.split('/').map((id) => {
        const rule = ruleDefinition(id);
        return (
          <div className="rule-explanation" key={id}>
            <strong>{ruleMeaning(id)}</strong>
            <p>
              <span className="muted">原文：</span>
              {rule?.sourceText ?? 'APP 自身检查；请核对相关文件。'}
            </p>
            <p title={criteria(id, rules, { fullKeywords: true })}>
              <span className="muted">判定口径：</span>
              {criteria(id, rules)}
            </p>
            <p>当前级别：{{ error: '错误', warning: '警告', info: '提示' }[finding.severity]}</p>
            {rule && (
              <button
                type="button"
                className="text-button"
                disabled={!openRule}
                onClick={() => openRule?.(id)}
              >
                在设置中查看 / 修改 →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
