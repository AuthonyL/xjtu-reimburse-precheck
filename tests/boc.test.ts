import { expect, it } from 'vitest';
import { isBocUrl } from '../src/main/store.js';
import { rateFromSelection } from '../src/main/boc-selection.js';
import { BOC_SELECTION_SCRIPT } from '../src/main/boc-script.js';
import { JSDOM } from 'jsdom';

const entry = {
  group: 'AI',
  currency: 'USD',
  amount: 20,
  paymentDate: '2026-01-02',
  exchangeRateType: '现汇买入价',
};
const selection = {
  value: 700.123,
  date: '2026-01-02',
  currencyName: '美元',
  rateType: '现汇买入价',
};
it('中行价格每100外币换算每1外币，不截断精度', () => {
  expect(rateFromSelection(selection, entry)).toBeCloseTo(7.00123, 12);
});
it('拒绝日期、币种、价格列不匹配与非法数值', () => {
  for (const value of [
    { ...selection, date: '2026-01-03' },
    { ...selection, currencyName: '欧元' },
    { ...selection, rateType: '现钞买入价' },
    { ...selection, value: -1 },
    { ...selection, value: Infinity },
  ])
    expect(() => rateFromSelection(value, entry)).toThrow();
});
it('中行URL限定HTTPS域名边界，不能凭后缀或凭据绕过', () => {
  expect(isBocUrl('https://srh.bankofchina.com/a')).toBe(true);
  for (const url of [
    'http://www.boc.cn/',
    'https://boc.cn.evil.example/',
    'https://evilboc.cn/',
    'https://user@boc.cn/',
    'file:///a',
    'https://boc.cn:123/',
  ])
    expect(isBocUrl(url)).toBe(false);
});

it('离线结果表注入：仅价格列可选，红圈选中格并回传日期、币种和列名', async () => {
  const dom = new JSDOM(
    `<table class="resTable"><thead><tr>
    <th>货币名称</th><th>现汇买入价</th><th>现钞买入价</th><th>现汇卖出价</th><th>现钞卖出价</th><th>中行折算价</th><th>发布时间</th>
    </tr></thead><tbody><tr><td>美元</td><td>700.123</td><td>699.00</td><td>701.00</td><td>702.00</td><td>700.00</td><td>2026/01/02 12:00:00</td></tr></tbody></table>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  try {
    const selected: unknown[] = [];
    Object.assign(dom.window, {
      bocSelection: {
        submit: async (value: unknown) => {
          selected.push(value);
        },
      },
    });
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    dom.window.eval(BOC_SELECTION_SCRIPT);
    dom.window.eval(BOC_SELECTION_SCRIPT);
    expect(dom.window.document.querySelectorAll('#precheck-rate-banner')).toHaveLength(1);
    const cells = dom.window.document.querySelectorAll('td');
    cells[0]!.click();
    cells[6]!.click();
    expect(selected).toHaveLength(0);
    cells[1]!.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(selected).toEqual([selection]);
    expect(cells[1]!.dataset.precheckRate).toBe('selected');
    expect(cells[1]!.style.outline).toContain('4px solid');
    expect(dom.window.document.querySelector('#precheck-rate-banner')!.textContent).toContain(
      '已保存',
    );
  } finally {
    dom.window.close();
  }
});

it('保存完成前锁定价格选择，连续点击不会改变首张截图的红圈', async () => {
  const dom = new JSDOM(
    `<table class="resTable"><thead><tr>
    <th>货币名称</th><th>现汇买入价</th><th>现钞买入价</th><th>现汇卖出价</th><th>现钞卖出价</th><th>中行折算价</th><th>发布时间</th>
    </tr></thead><tbody><tr><td>美元</td><td>700</td><td></td><td></td><td></td><td></td><td>2026/01/02 12:00:00</td></tr>
    <tr><td>欧元</td><td>800</td><td></td><td></td><td></td><td></td><td>2026/01/02 12:00:00</td></tr></tbody></table>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  try {
    const observed: { value: number; highlighted: string | null }[] = [];
    Object.assign(dom.window, {
      bocSelection: {
        submit: async (selection: { value: number }) => {
          observed.push({
            value: selection.value,
            highlighted:
              dom.window.document.querySelector('[data-precheck-rate]')?.textContent ?? null,
          });
        },
      },
    });
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    dom.window.eval(BOC_SELECTION_SCRIPT);
    const cells = dom.window.document.querySelectorAll<HTMLTableCellElement>('tbody td');
    cells[1]!.click();
    cells[8]!.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(observed).toEqual([{ value: 700, highlighted: '700' }]);
    cells[8]!.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(observed[1]).toEqual({ value: 800, highlighted: '800' });
  } finally {
    dom.window.close();
  }
});
