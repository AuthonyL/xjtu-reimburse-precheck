import { containsAny } from '../../../config.js';
import type { EvalContext } from '../../context.js';
import { emit } from '../../effects.js';

export function highValue(ctx: EvalContext): void {
  const invoice = ctx.invoice!;
  const highValueLines = ctx.item!.highValueLines;
  if (!highValueLines.length) return;
  const instrument = highValueLines.filter((n) =>
    containsAny(
      `${invoice.lines[n]!.taxCategory} ${invoice.lines[n]!.name}`,
      ctx.config.instrumentKeywords,
    ),
  );
  if (instrument.length)
    emit(ctx, {
      kind: 'require',
      attachment: 'assetRegistration',
      reason: '仪器类含税单价达到高值阈值，需要资产建账；请确认资产分类',
    });
  if (instrument.length < highValueLines.length)
    emit(ctx, {
      kind: 'require',
      attachment: 'highValueApproval',
      reason: '含税单价达到高值阈值，需要高值材料审批表；使用期须不超过1年，否则请按资产建账',
    });
  emit(ctx, {
    kind: 'require',
    attachment: 'explanation',
    reason: '需要附情况说明；理由库草稿须与实际使用期限及用途核对',
  });
}
