import { meets } from '../../config.js';
import type { ThresholdRule } from '../../model.js';
import type { EvalContext } from '../context.js';
import { emit } from '../effects.js';

export function threshold(rule: ThresholdRule, ctx: EvalContext): void {
  const i = ctx.invoice;
  const key = i && ctx.aggregates.sellerDay.get(i);
  const value =
    rule.measure === 'delegatedTotal'
      ? ctx.group.delegatedTotal
      : rule.measure === 'groupTotal'
        ? ctx.group.groupTotal
        : rule.measure === 'grossUnitPrice'
          ? Math.max(...(i?.lines.map((l) => l.grossUnitPrice ?? -Infinity) ?? []))
          : rule.period === 'day' && key
            ? ctx.aggregates.daily.get(key)!
            : (i?.total ?? 0);
  if (!meets(value, rule.threshold)) return;
  for (const effect of Array.isArray(rule.effect) ? rule.effect : [rule.effect])
    emit(ctx, effect, rule.target);
}
