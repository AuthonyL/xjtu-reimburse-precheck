import type { Batch } from '../../../types.js';
import type { PassthroughRule } from '../../model.js';
import type { Collector } from '../collector.js';
import type { EvalContext } from '../context.js';

export function diagnostics(batch: Batch, collector: Collector): void {
  for (const diagnostic of batch.diagnostics)
    collector.finding(
      diagnostic.ruleId,
      diagnostic.message,
      batch.invoices.filter((i) => diagnostic.invoiceNumbers.includes(i.number)),
      diagnostic.groupId,
      diagnostic.files,
    );
}
export function passthrough(rule: PassthroughRule, ctx: EvalContext): void {
  if (rule.id !== 'parse' || !ctx.invoice) return;
  const i = ctx.invoice;
  if (i.kind === 'domestic' && i.lines.some((l) => !l.taxCategory))
    ctx.collector.finding(
      rule.id,
      '明细缺少税目信息，已按品名及默认实物规则提示，请人工核对服务或委托业务分类',
      [i],
      ctx.group.group.id,
    );
  for (const warning of i.warnings)
    ctx.collector.finding(rule.id, warning, [i], ctx.group.group.id);
}
