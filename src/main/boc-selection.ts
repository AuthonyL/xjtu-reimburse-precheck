import type { ManualEntry } from '../core/types.js';
import type { BocSelection } from '../shared/api.js';

export const currencyNames: Record<string, string[]> = {
  USD: ['美元'],
  EUR: ['欧元'],
  JPY: ['日元'],
  GBP: ['英镑'],
  HKD: ['港币'],
  AUD: ['澳大利亚元', '澳元'],
  CAD: ['加拿大元'],
  CHF: ['瑞士法郎'],
  SGD: ['新加坡元'],
  KRW: ['韩国元', '韩元'],
  NZD: ['新西兰元'],
  TWD: ['新台币'],
  MOP: ['澳门元'],
  THB: ['泰国铢'],
  MYR: ['林吉特'],
  RUB: ['卢布'],
  SEK: ['瑞典克朗'],
  NOK: ['挪威克朗'],
  DKK: ['丹麦克朗'],
  INR: ['印度卢比'],
  AED: ['阿联酋迪拉姆'],
  ZAR: ['南非兰特'],
};
export function rateFromSelection(value: BocSelection, entry: ManualEntry): number {
  if (!value || !Number.isFinite(value.value) || value.value <= 0)
    throw new Error('请选择有效的价格单元格');
  if (value.date !== entry.paymentDate) throw new Error('牌价日期与支付日不符，请按支付日查询');
  if (!currencyNames[entry.currency]?.includes(value.currencyName.trim()))
    throw new Error('牌价币种与手填币种不符或尚不支持，请核对后手填');
  if (value.rateType !== entry.exchangeRateType)
    throw new Error(`请选择${entry.exchangeRateType}列`);
  return value.value / 100;
}
