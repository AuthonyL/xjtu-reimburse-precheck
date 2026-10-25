import defaults from './defaults.json' with { type: 'json' };
import type { RuleConfig } from './config.js';

export function exportRulesConfig(
  config: RuleConfig,
): Omit<RuleConfig, 'dupChecksum'> & { dupChecksum?: boolean } {
  const exported: Omit<RuleConfig, 'dupChecksum'> & { dupChecksum?: boolean } =
    structuredClone(config);
  if (exported.dupChecksum === defaults.dupChecksum) delete exported.dupChecksum;
  return exported;
}
