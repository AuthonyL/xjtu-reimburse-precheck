import type { EvalContext } from '../../context.js';

export function missingSellerDay(ctx: EvalContext, message: string): void {
  const i = ctx.invoice;
  if (i?.kind === 'domestic' && !ctx.aggregates.sellerDay.get(i))
    ctx.collector.finding(ctx.rule.id, message, [i], ctx.group.group.id);
}
