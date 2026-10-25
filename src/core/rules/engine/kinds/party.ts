import { hasValidTaxIdLength } from '../../../parse/common.js';
import type { PartyRule } from '../../model.js';
import type { EvalContext } from '../context.js';

export function party(rule: PartyRule, ctx: EvalContext): void {
  const i = ctx.invoice!;
  const buyer = i[rule.party];
  if (
    buyer.name.replace(/\s/g, '') !== rule.expected.name.replace(/\s/g, '') ||
    (hasValidTaxIdLength(buyer.taxId) && buyer.taxId !== rule.expected.taxId)
  )
    ctx.collector.finding(
      rule.id,
      `购买方名称或税号不符，应为${rule.expected.name} / ${rule.expected.taxId}`,
      [i],
      ctx.group.group.id,
    );
}
