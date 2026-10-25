import { containsAny } from '../config.js';
import type { Effect, Rule, Target } from '../model.js';
import type { EvalContext } from './context.js';

export function applies(rule: Rule, ctx: EvalContext): boolean {
  const a = rule.appliesTo;
  if (!a) return true;
  const i = ctx.invoice;
  if (a.kinds && (!i || !a.kinds.includes(i.kind))) return false;
  if (a.currency && (!i || !a.currency.includes(i.currency))) return false;
  if (a.physicalOnly && (!i || !ctx.aggregates.invoices.get(i)!.physical)) return false;
  for (const [key, value] of Object.entries(a.groupFlags ?? {}))
    if (ctx.group.group.flags[key as keyof typeof ctx.group.group.flags] !== value) return false;
  for (const [key, value] of Object.entries(a.notGroupFlags ?? {}))
    if (ctx.group.group.flags[key as keyof typeof ctx.group.group.flags] === value) return false;
  if (a.excludeNamedAiGroup && ctx.group.namedAi) return false;
  if (
    a.excludeNamedOutsourcedGroup &&
    containsAny(ctx.group.group.name, a.excludeNamedOutsourcedGroup)
  )
    return false;
  if (a.requireHighValue && !ctx.group.high.length) return false;
  return true;
}
export function emit(ctx: EvalContext, effect: Effect, target: Target = 'invoice'): void {
  const invoices =
    target === 'delegated'
      ? ctx.group.delegatedInvoices
      : target === 'highValue'
        ? ctx.group.high
        : ctx.invoice
          ? [ctx.invoice]
          : [];
  if (effect.kind === 'finding') {
    ctx.collector.finding(
      ctx.rule.id,
      effect.message,
      invoices,
      ctx.group.group.id,
      undefined,
      false,
      { code: effect.code },
    );
    return;
  }
  const dayKey = ctx.invoice && ctx.aggregates.sellerDay.get(ctx.invoice);
  const values: Record<string, string> = {
    dayTotal: (dayKey ? ctx.aggregates.daily.get(dayKey)! : (ctx.invoice?.total ?? 0)).toFixed(2),
    delegatedTotal: ctx.group.delegatedTotal.toFixed(2),
    groupTotal: ctx.group.groupTotal.toFixed(2),
  };
  // 仅阈值规则的内置模板插值，保留自定义科目或汇率类型中的字面花括号。
  const reason =
    ctx.rule.kind === 'threshold'
      ? effect.reason.replace(
          /\{(\w+)\}/g,
          (placeholder, key: string) => values[key] ?? placeholder,
        )
      : effect.reason;
  ctx.collector.require(
    ctx.checked,
    ctx.group,
    effect.attachment,
    ctx.rule.id,
    reason,
    invoices,
    effect,
  );
}
