import { roundMoney } from '../../../../parse/common.js';
import { isAiInvoice } from '../../../config.js';
import type { EvalContext } from '../../context.js';
import { emit } from '../../effects.js';

const aiOrForeign = (ctx: EvalContext) =>
  ctx.group.namedAi ||
  isAiInvoice(ctx.invoice!, ctx.config) ||
  ctx.invoice!.kind !== 'domestic' ||
  ctx.invoice!.currency !== 'CNY';
export function aiPayment(ctx: EvalContext): void {
  const invoice = ctx.invoice!;
  if (!aiOrForeign(ctx)) return;
  emit(ctx, { kind: 'require', attachment: 'payment', reason: 'AI订阅或外币收据需要付款凭证' });
  emit(ctx, {
    kind: 'require',
    attachment: 'subscription',
    reason: '需要订阅方案、介绍或定价截图',
  });
  if (invoice.currency !== 'CNY' && !invoice.date)
    ctx.collector.finding(
      'R3',
      '请手填金额和支付日期',
      [invoice],
      ctx.group.group.id,
      undefined,
      false,
      { code: 'manual-amount' },
    );
}
export function exchangeRate(ctx: EvalContext): void {
  const invoice = ctx.invoice!;
  if (!aiOrForeign(ctx)) return;
  emit(ctx, {
    kind: 'require',
    attachment: 'exchangeRate',
    reason:
      invoice.currency !== 'CNY'
        ? `请附支付日${invoice.date || '（待填）'}的中行${ctx.config.exchangeRateType}截图，并圈出所用汇率`
        : `请核对实际支付日并附中行${ctx.config.exchangeRateType}截图，圈出所用汇率；人民币发票请确认是否涉及外币支付`,
  });
  if (invoice.currency === 'CNY') return;
  const manual = ctx.aggregates.manualEntries.get(invoice);
  if (!manual?.exchangeRate)
    ctx.collector.finding(
      'R10',
      '请手填汇率；截图不能自动读取牌价，折算金额留空',
      [invoice],
      ctx.group.group.id,
    );
  else if (
    manual.currency !== invoice.currency ||
    manual.paymentDate !== invoice.date ||
    (manual.exchangeRateType && manual.exchangeRateType !== ctx.config.exchangeRateType)
  )
    ctx.collector.finding(
      'R10',
      '手填汇率的币种、支付日或汇率类型不匹配，折算金额留空',
      [invoice],
      ctx.group.group.id,
    );
  else
    ctx.item!.cnyAmount = roundMoney(
      (invoice.total * manual.exchangeRate) / (manual.rateBase ?? 1),
    );
}
export function aiGroup(ctx: EvalContext): void {
  const { group, invoices } = ctx.group;
  if (group.flags.ai && !invoices.length) {
    // 组尾复用 R3/R10 的同一 registry 项，保持空组材料插入顺序。
    ctx.collector.require(ctx.checked, ctx.group, 'payment', 'R3', 'AI订阅需要付款凭证', []);
    ctx.collector.require(
      ctx.checked,
      ctx.group,
      'subscription',
      'R3',
      'AI订阅需要订阅说明截图',
      [],
    );
    ctx.collector.require(
      ctx.checked,
      ctx.group,
      'exchangeRate',
      'R10',
      `按支付日提供中行${ctx.config.exchangeRateType}截图，并圈出所用汇率`,
      [],
    );
    ctx.collector.finding(
      'R3',
      '仅有截图或无法读取收据，请手填金额和支付日期',
      [],
      group.id,
      undefined,
      false,
      { code: 'manual-amount' },
    );
    ctx.collector.finding('R10', '请手填汇率；无手填汇率时折算金额留空', [], group.id);
  }
  const images = ctx.group.images;
  if (group.flags.ai && invoices.length && images.length)
    ctx.collector.finding(
      'R3',
      '本组仍有未识别截图，请确认是否为其他订阅收据；如是，请手填金额和支付日期',
      [],
      group.id,
      images,
      false,
      { code: 'manual-amount' },
    );
}
