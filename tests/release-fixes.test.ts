import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { BOC_SELECTION_SCRIPT } from '../src/main/boc-script.js';
import { captureBocPage } from '../src/main/boc-capture.js';
import { checkBatch, loadConfig } from '../src/core/index.js';
import { batch, invoice } from './helpers.js';

const headers = [
  '货币名称',
  '现汇买入价',
  '现钞买入价',
  '现汇卖出价',
  '现钞卖出价',
  '中行折算价',
  '发布时间',
];
for (const structure of ['thead', 'tbody-th', 'tbody-td'])
  it(`牌价列名兼容 ${structure} 表头`, async () => {
    const tag = structure === 'tbody-td' ? 'td' : 'th';
    const row = '<tr>' + headers.map((h) => `<${tag}>${h}</${tag}>`).join('') + '</tr>';
    const body =
      '<tr><td>美元</td><td>669.87</td><td></td><td></td><td></td><td></td><td>2026/01/02 12:00:00</td></tr>';
    const html =
      structure === 'thead'
        ? `<thead>${row}</thead><tbody>${body}</tbody>`
        : `<tbody>${row}${body}</tbody>`;
    const dom = new JSDOM(`<table class="resTable">${html}</table>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    try {
      const values: unknown[] = [];
      Object.assign(dom.window, {
        bocSelection: {
          submit: async (value: unknown) => {
            values.push(value);
          },
        },
      });
      dom.window.HTMLElement.prototype.scrollIntoView = () => {};
      dom.window.eval(BOC_SELECTION_SCRIPT);
      dom.window.document.querySelectorAll<HTMLTableRowElement>('tr')[1]!.cells[1]!.click();
      await expect
        .poll(() => values)
        .toEqual([
          { value: 669.87, date: '2026-01-02', currencyName: '美元', rateType: '现汇买入价' },
        ]);
    } finally {
      dom.window.close();
    }
  });

it('截图时隐藏 banner、等待两帧，保留红圈，成功或失败都恢复提示条', async () => {
  const dom = new JSDOM(
    '<div id="precheck-rate-banner" style="display:block">报销预检</div><table><tr><td data-precheck-rate="selected" style="outline:4px solid red">669.87</td></tr></table>',
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  try {
    const banner = dom.window.document.getElementById('precheck-rate-banner')!;
    let frames = 0;
    dom.window.requestAnimationFrame = (fn) => {
      frames++;
      fn(0);
      return frames;
    };
    for (const fail of [false, true]) {
      const operation = captureBocPage({
        executeJavaScript: async (script: string) => dom.window.eval(script) as unknown,
        capturePage: async () => {
          expect(banner.style.display).toBe('none');
          expect(
            dom.window.document.querySelector<HTMLElement>('[data-precheck-rate]')!.style.outline,
          ).toBe('4px solid red');
          expect(frames).toBeGreaterThanOrEqual(2);
          if (fail) throw new Error('合成截图失败');
          return 'synthetic-image';
        },
      });
      if (fail) await expect(operation).rejects.toThrow('合成截图失败');
      else expect(await operation).toBe('synthetic-image');
      expect(banner.style.display).toBe('block');
    }
  } finally {
    dom.window.close();
  }
});

it('同一条入库材料的 R1/R11 只生成一条 Finding，并合并显示规则 id', () => {
  const b = batch([invoice({ total: 600 })]);
  const result = checkBatch(b, loadConfig());
  const requirement = result.groups[0]!.requirements.find((r) => r.type === 'inventory')!;
  expect(requirement.ruleIds).toEqual(expect.arrayContaining(['R1', 'R11']));
  const findings = result.findings.filter((f) => f.message.includes('入库单 / 记账单'));
  expect(findings).toHaveLength(1);
  expect(findings[0]!.ruleId).toBe('R1/R11');
});
