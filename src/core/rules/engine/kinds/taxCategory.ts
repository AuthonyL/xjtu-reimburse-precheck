import { containsAny, invoiceRuleText, isAiInvoice, matchesServiceCategory } from '../../config.js';
import type { TaxCategoryRule } from '../../model.js';
import type { EvalContext } from '../context.js';
import { emit } from '../effects.js';

export function taxCategory(rule: TaxCategoryRule, ctx: EvalContext): void {
  const i = ctx.invoice!;
  const matches =
    rule.match === 'physical'
      ? ctx.aggregates.invoices.get(i)!.physical
      : i.kind === 'domestic' &&
        !isAiInvoice(i, ctx.config) &&
        (i.lines.some((l) => l.taxCategory)
          ? i.lines.some((l) => matchesServiceCategory(l.taxCategory, rule.categories))
          : containsAny(invoiceRuleText(i), rule.categories));
  if (matches) emit(ctx, rule.effect, rule.target);
}
