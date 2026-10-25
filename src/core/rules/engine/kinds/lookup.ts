import type { LookupRule } from '../../model.js';
import type { EvalContext } from '../context.js';

export function lookup(
  rule: LookupRule,
  ctx: Pick<EvalContext, 'invoice' | 'batch' | 'context' | 'collector'>,
): void {
  const invoice = ctx.invoice!;
  if (
    ctx.context.rejectedNumbers?.has(invoice.number) ||
    ctx.context.rejectedInfo?.has(invoice.number)
  ) {
    const info = ctx.context.rejectedInfo?.get(invoice.number);
    const detail = info?.recorded
      ? `原因：${info.recorded.reason}（记录于 ${info.recorded.recordedAt.slice(0, 10)}）`
      : info?.inferred.length
        ? '可能原因（按规则推断）：' + info.inferred.map((r) => `${r.ruleId} ${r.name}`).join('、')
        : '未记录原因，可在『无法报销费用』里补充';
    ctx.collector.finding(rule.id, '曾判为无法报销 — ' + detail, [invoice]);
  }
}
