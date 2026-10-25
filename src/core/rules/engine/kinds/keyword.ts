import { containsAny, invoiceRuleText } from '../../config.js';
import type { KeywordRule } from '../../model.js';
import type { EvalContext } from '../context.js';
import { emit } from '../effects.js';

export function keyword(rule: KeywordRule, ctx: EvalContext): void {
  const i = ctx.invoice!;
  const text =
    rule.field === 'groupName'
      ? ctx.group.group.name
      : rule.field === 'invoiceText'
        ? (i.text ?? '')
        : rule.field === 'lineName'
          ? i.lines.map((l) => l.name).join(' ')
          : invoiceRuleText(i);
  const matches =
    rule.match === 'unmappedExpense'
      ? ctx.item!.expenseContent === rule.unknownExpense
      : rule.match === 'legacy' && !i.text
        ? i.invoiceType === 'legacy'
        : containsAny(text, rule.keywords);
  if (matches) emit(ctx, rule.effect, rule.target);
}
