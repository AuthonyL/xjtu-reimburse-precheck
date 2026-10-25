import { containsAny, invoiceRuleText } from '../../../config.js';
import type { EvalContext } from '../../context.js';
import { emit } from '../../effects.js';

export function travel(ctx: EvalContext): void {
  const i = ctx.invoice!;
  if (i.kind === 'domestic' && containsAny(invoiceRuleText(i), ctx.config.transportKeywords))
    emit(ctx, {
      kind: 'require',
      attachment: 'itinerary',
      reason: '市内交通需附对应行程单（仅同文件夹，前缀优先，其次金额，一一匹配）',
    });
}
