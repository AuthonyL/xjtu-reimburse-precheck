import type { Batch, CheckContext, CheckResult, CheckedGroup } from '../../types.js';
import { loadConfig, type RuleConfig } from '../config.js';
import { buildRules } from '../definitions.js';
import type { Rule } from '../model.js';
import { aggregate, finishExpense } from './aggregate.js';
import { Collector } from './collector.js';
import type { EvalContext } from './context.js';
import { applies } from './effects.js';
import { threshold } from './kinds/threshold.js';
import { keyword } from './kinds/keyword.js';
import { taxCategory } from './kinds/taxCategory.js';
import { party } from './kinds/party.js';
import { duplicate } from './kinds/duplicate.js';
import { lookup } from './kinds/lookup.js';
import { diagnostics, passthrough } from './kinds/passthrough.js';
import { missingSellerDay } from './kinds/coded/seller-day.js';
import { aiGroup } from './kinds/coded/currency.js';

function evaluate(rule: Rule, ctx: EvalContext): void {
  if (rule.kind === 'threshold' && rule.missingAggregation)
    missingSellerDay(ctx, rule.missingAggregation.message);
  if (!applies(rule, ctx)) return;
  // 禁用只由收集器抑制输出；外币折算等派生值仍按原实现计算。
  switch (rule.kind) {
    case 'threshold':
      threshold(rule, ctx);
      break;
    case 'keyword':
      keyword(rule, ctx);
      break;
    case 'taxCategory':
      taxCategory(rule, ctx);
      break;
    case 'party':
      party(rule, ctx);
      break;
    case 'passthrough':
      passthrough(rule, ctx);
      break;
    case 'coded':
      if (rule.executor === 'batch') rule.run(ctx);
      break;
  }
}
export function checkBatch(
  batch: Batch,
  config: RuleConfig = loadConfig(),
  context: CheckContext = {},
): CheckResult {
  const rules = buildRules(config);
  const registry = new Map(rules.map((rule) => [rule.id, rule]));
  const aggregates = aggregate(batch, config);
  const collector = new Collector(batch, config, registry, aggregates);
  const shared = { batch, config, context, aggregates, collector };
  diagnostics(batch, collector);
  const invoiceRules = rules.filter((r) => r.stage === 'invoice');
  const groupRules = rules.filter((r) => r.stage === 'group');
  const groups = aggregates.groups.map((group): CheckedGroup => {
    const checked: CheckedGroup = {
      group: group.group,
      requirements: [],
      invoices: [],
      expenseContent: config.expense.unknown,
    };
    for (const invoice of group.invoices) {
      const item = {
        invoice,
        expenseContent: group.expenseContent.get(invoice)!,
        cnyAmount: invoice.currency === 'CNY' ? invoice.total : null,
        highValueLines: aggregates.invoices.get(invoice)!.highValueLines,
      };
      for (const rule of invoiceRules)
        evaluate(rule, { ...shared, group, checked, invoice, item, rule });
      checked.invoices.push(item);
    }
    for (const rule of groupRules) evaluate(rule, { ...shared, group, checked, rule });
    aiGroup({ ...shared, group, checked, rule: registry.get('R3')! });
    finishExpense(checked, config);
    collector.finish(checked, group);
    return checked;
  });
  for (const invoice of batch.invoices)
    for (const rule of rules.filter((r) => r.stage === 'workspace')) {
      const ctx = { ...shared, invoice };
      if (rule.kind === 'duplicate') duplicate(rule, ctx);
      if (rule.kind === 'lookup') lookup(rule, ctx);
    }
  const rank = { error: 0, warning: 1, info: 2 };
  collector.findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.ruleId.localeCompare(b.ruleId),
  );
  return { batch, findings: collector.findings, groups };
}
