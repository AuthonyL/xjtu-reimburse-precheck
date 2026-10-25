import { dirname } from 'node:path';
import { pathKey } from '../../../fs-path.js';
import type { DuplicateRule } from '../../model.js';
import type { EvalContext } from '../context.js';

export function duplicate(
  rule: DuplicateRule,
  ctx: Pick<EvalContext, 'invoice' | 'batch' | 'context' | 'collector'>,
): void {
  const invoice = ctx.invoice!;
  const dirs = new Set(invoice.sources.map((s) => pathKey(dirname(s.path))));
  const formats = invoice.sources.map((s) => s.format);
  if (rule.scopes.includes('batch') && (dirs.size > 1 || new Set(formats).size < formats.length))
    ctx.collector.finding(
      rule.id,
      '同一批次内同号发票在不同目录或同一格式中重复出现，合计仅计一张',
      [invoice],
    );
  if (rule.scopes.includes('workspace'))
    for (const other of ctx.context.otherBatches ?? [])
      if (other.id !== ctx.batch.id && other.invoices.some((i) => i.number === invoice.number))
        ctx.collector.finding(
          rule.id,
          other.submitted
            ? `与${other.id}重复：已在 ${other.id} 报销（该批次已有学校报销单）`
            : `与其他批次 ${other.id} 重复`,
          [invoice],
        );
  if (rule.scopes.includes('history') && ctx.context.submittedHistory?.has(invoice.number))
    ctx.collector.finding(rule.id, '发票号已存在于已提交历史，请勿重复报销', [invoice]);
}
