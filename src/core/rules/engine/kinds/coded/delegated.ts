import { isAiInvoice, matchesServiceCategory } from '../../../config.js';
import type { EvalContext } from '../../context.js';

export function delegatedMaterials(ctx: EvalContext): void {
  const invoice = ctx.invoice!;
  if (
    ctx.group.namedAi ||
    !ctx.group.group.flags.outsourced ||
    invoice.kind !== 'domestic' ||
    isAiInvoice(invoice, ctx.config)
  )
    return;
  const material = invoice.lines.filter(
    (line) =>
      line.taxCategory.trim() &&
      !matchesServiceCategory(line.taxCategory, ctx.config.serviceTaxCategories),
  );
  const service = invoice.lines.some((line) =>
    matchesServiceCategory(line.taxCategory, ctx.config.serviceTaxCategories),
  );
  if (material.length && service) {
    const details = material
      .map((line) => {
        const amount =
          line.amount === null
            ? '金额待读取'
            : `${line.amount.toFixed(2)}元（含税${(line.amount + (line.tax ?? 0)).toFixed(2)}元）`;
        return `${line.name} ${amount}`;
      })
      .join('；');
    ctx.collector.finding(
      ctx.rule.id,
      `委托发票中混有材料明细：${details}；材料部分需入库，或请对方分开开票`,
      [invoice],
      ctx.group.group.id,
      undefined,
      false,
      { code: 'mixed-materials', severity: ctx.config.mixedDelegatedSeverity },
    );
  } else if (material.length === invoice.lines.length && material.length)
    ctx.collector.finding(
      ctx.rule.id,
      '委托业务发票不要开成材料（应为生产生活服务 / 研发和技术服务 / 劳务等）',
      [invoice],
      ctx.group.group.id,
      undefined,
      false,
      { code: 'all-materials' },
    );
}
