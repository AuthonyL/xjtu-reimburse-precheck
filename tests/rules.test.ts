import { describe, expect, it } from 'vitest';
import { checkBatch } from '../src/core/rules/engine.js';
import { buildReport } from '../src/core/report.js';
import { loadConfig } from '../src/core/rules/config.js';
import { batch, config, invoice, line } from './helpers.js';
import type { Batch, CheckContext } from '../src/core/types.js';

const run = (b: Batch, context: CheckContext = {}) => checkBatch(b, config(), context);
const needs = (b: Batch) =>
  run(b)
    .groups.flatMap((g) => g.requirements)
    .map((r) => r.type);
describe('规则阈值和不命中', () => {
  it('购买方名称与税号各自校验，海外收据豁免国内抬头', () => {
    expect(run(batch()).findings.filter((f) => f.ruleId === 'buyer')).toHaveLength(0);
    for (const buyer of [
      { name: '错误', taxId: 'SYNTHBUYER00000001' },
      { name: '合成大学', taxId: 'SYNTHBUYER00000002' },
    ])
      expect(
        run(batch([invoice({ buyer })])).findings.some(
          (f) => f.ruleId === 'buyer' && f.severity === 'error',
        ),
      ).toBe(true);
    expect(
      run(
        batch([invoice({ kind: 'foreign', currency: 'USD', buyer: { name: '', taxId: '' } })]),
      ).findings.some((f) => f.ruleId === 'buyer'),
    ).toBe(false);
  });
  it.each([499.99, 500])('R1 单票边界 %s', (total) => {
    expect(needs(batch([invoice({ total })])).includes('inventory')).toBe(total >= 500);
  });
  it('R11 整批跨组同销方同日拆票达到500，其他日期不合并', () => {
    const a = invoice({ number: 'SYNTH-A', total: 250 });
    const b = invoice({ number: 'SYNTH-B', total: 250 });
    const v = batch([a, b]);
    v.groups[0]!.invoiceNumbers = [a.number];
    v.groups.push({ ...v.groups[0]!, id: '另一组', name: '另一组', invoiceNumbers: [b.number] });
    expect(run(v).groups.every((g) => g.requirements.some((r) => r.type === 'inventory'))).toBe(
      true,
    );
    b.date = '2026-01-03';
    expect(needs(v)).not.toContain('inventory');
  });
  it('同名销方仅一张缺税号时按唯一已知税号合并，不能漏掉拆票', () => {
    const a = invoice({ number: 'SYNTH-A', total: 250 });
    const b = invoice({
      number: 'SYNTH-B',
      total: 250,
      seller: { name: a.seller.name, taxId: '' },
    });
    expect(
      run(batch([a, b])).groups[0]!.requirements.filter((r) => r.type === 'inventory'),
    ).toHaveLength(1);
  });
  it('同名对应多个税号且有缺税号票时提示无法可靠检查', () => {
    const a = invoice({ number: 'SYNTH-A', total: 250 });
    const b = invoice({
      number: 'SYNTH-B',
      total: 250,
      seller: { name: a.seller.name, taxId: 'SYNTH-OTHER' },
    });
    const c = invoice({
      number: 'SYNTH-C',
      total: 250,
      seller: { name: a.seller.name, taxId: '' },
    });
    expect(
      run(batch([a, b, c])).findings.some(
        (f) => f.ruleId === 'R11' && f.message.includes('无法可靠'),
      ),
    ).toBe(true);
  });
  it('豁免服务、混合实物与服务、公转器件及外包例外', () => {
    const service = invoice({
      total: 2000,
      lines: [line({ name: '*快递服务*收派费', taxCategory: '快递服务', grossUnitPrice: 2000 })],
    });
    expect(needs(batch([service], '公转'))).not.toContain('inventory');
    expect(needs(batch([service]))).not.toContain('highValueApproval');
    expect(needs(batch([invoice()], '公转'))).toContain('inventory');
    expect(needs(batch([invoice()], '外包公转'))).not.toContain('inventory');
    expect(needs(batch([{ ...service, lines: [...service.lines, line()] }]))).toContain(
      'inventory',
    );
  });
  it('R9 公转混合设计服务和器件仍需入库', () => {
    const i = invoice({
      lines: [line({ taxCategory: '设计服务', name: '*设计服务*制图' }), line()],
    });
    expect(needs(batch([i], '公转'))).toContain('inventory');
  });
  it.each([999.99, 1000])('R2 销方日合计边界 %s', (total) => {
    expect(needs(batch([invoice({ total })])).includes('payment')).toBe(total >= 1000);
  });
  it.each([4999.99, 5000])('R7 验真边界 %s', (total) => {
    expect(needs(batch([invoice({ total })])).includes('verification')).toBe(total >= 5000);
  });
  it.each([999.99, 1000])('R13 含税单价边界 %s', (grossUnitPrice) => {
    expect(
      needs(batch([invoice({ lines: [line({ unitPrice: 900, grossUnitPrice })] })])).includes(
        'highValueApproval',
      ),
    ).toBe(grossUnitPrice >= 1000);
  });
  it.each([9999.99, 10000])('R12 组合计边界 %s', (total) => {
    expect(
      needs(batch([invoice({ total, lines: [line({ grossUnitPrice: 1000 })] })])).includes(
        'systemApproval',
      ),
    ).toBe(total >= 10000);
  });
  it('仪器走资产建账，情况说明必需', () => {
    const b = batch([
      invoice({
        lines: [line({ name: '*仪器仪表*示波器', taxCategory: '仪器仪表', grossUnitPrice: 1000 })],
      }),
    ]);
    expect(needs(b)).toContain('assetRegistration');
    expect(needs(b)).toContain('explanation');
    expect(needs(b)).not.toContain('highValueApproval');
  });
  it('比较方向与阈值可覆盖，非法配置失败', () => {
    const c = loadConfig({ thresholds: { highUnit: { operator: '>' } } });
    expect(
      checkBatch(
        batch([invoice({ lines: [line({ grossUnitPrice: 1000 })] })]),
        { ...c, buyer: config().buyer },
        {},
      ).groups[0]!.requirements.some((r) => r.type === 'highValueApproval'),
    ).toBe(false);
    expect(() => loadConfig({ thresholds: { inventory: { value: -1 } } })).toThrow();
    expect(() => loadConfig({ exchangeRateType: '' })).toThrow();
    expect(loadConfig({ attachmentKeywords: { store: [] } }).attachmentKeywords.store).toEqual([]);
  });
});
describe('材料、支出内容、重复和外币', () => {
  it('R4 亚克力/模具需店铺，普通器件不需要', () => {
    for (const name of ['*塑料*亚克力板', '*塑料*模具'])
      expect(needs(batch([invoice({ lines: [line({ name })] })]))).toContain('store');
    expect(needs(batch())).not.toContain('store');
  });
  it('R5/R6 设计服务与外包归委托业务费，要求设计清单', () => {
    for (const b of [
      batch([invoice({ lines: [line({ taxCategory: '电路设计服务' })] })]),
      batch([invoice()], '外包 PCB'),
    ]) {
      const r = run(b);
      expect(r.groups[0]!.invoices[0]!.expenseContent).toBe('委托业务费');
      expect(needs(b)).toContain('designList');
    }
    expect(needs(batch())).not.toContain('designList');
  });
  it('F2 替代 R14，文具或办公用品报横向限制 warning', () => {
    for (const name of ['*文具*笔', '*其他*办公用品'])
      expect(
        run(batch([invoice({ lines: [line({ name })] })])).findings.some(
          (f) => f.ruleId === 'F2' && f.severity === 'warning',
        ),
      ).toBe(true);
    expect(run(batch()).findings.some((f) => f.ruleId === 'R14')).toBe(false);
  });
  it('同号互补格式不报重复，相同格式和跨目录报重复', () => {
    const i = invoice();
    i.sources.push({ ...i.sources[0]!, path: '/synthetic/根目录/a.xml', format: 'xml' });
    expect(run(batch([i])).findings.some((f) => f.ruleId === 'dup')).toBe(false);
    i.sources.push({ ...i.sources[0]!, path: '/synthetic/另一组/b.pdf' });
    expect(run(batch([i])).findings.some((f) => f.ruleId === 'dup' && f.severity === 'error')).toBe(
      true,
    );
  });
  it('跨批次重复、已提交历史、拒票及已报销说明', () => {
    const other = batch();
    other.id = '20251201';
    other.submitted = true;
    const r = run(batch(), {
      otherBatches: [other],
      submittedHistory: new Set(['SYNTH-001']),
      rejectedNumbers: new Set(['SYNTH-001']),
    });
    expect(r.findings.some((f) => f.message.includes('已在 20251201 报销'))).toBe(true);
    expect(r.findings.some((f) => f.message.includes('已提交历史'))).toBe(true);
    expect(
      r.findings.some((f) => f.message.includes('曾判为无法报销') && f.severity === 'warning'),
    ).toBe(true);
  });
  it('同目录优先，根目录找到必须确认对应，不借用其他业务组材料', () => {
    const b = batch([invoice({ total: 500 })], '组A', ['inventory']);
    b.invoices[0]!.sources[0]!.path = '/synthetic/组A/a.pdf';
    expect(run(b).groups[0]!.requirements.find((r) => r.type === 'inventory')!.status).toBe(
      'found',
    );
    b.attachments[0]!.directory = '/synthetic';
    expect(run(b).groups[0]!.requirements.find((r) => r.type === 'inventory')!.note).toContain(
      '在批次根目录找到，请确认对应',
    );
    b.attachments[0]!.directory = '/synthetic/组B';
    expect(run(b).groups[0]!.requirements.find((r) => r.type === 'inventory')!.status).toBe(
      'missing',
    );
  });
  it('R3/R10 截图 AI 仍需材料并提示手填金额、日期、汇率', () => {
    const b = batch([], 'AI', ['payment', 'exchangeRate']);
    const r = run(b);
    expect(r.groups[0]!.expenseContent).toBe('资料费');
    expect(r.groups[0]!.requirements.map((r) => r.type)).toEqual(
      expect.arrayContaining(['payment', 'subscription', 'exchangeRate']),
    );
    expect(r.findings.some((f) => f.message.includes('请手填金额和支付日期'))).toBe(true);
    expect(r.findings.some((f) => f.message.includes('汇率'))).toBe(true);
  });
  it('AI 组中收据 PDF 与未识别截图并存，截图仍须手填且报告标为不完整', () => {
    const b = batch([invoice({ kind: 'foreign', currency: 'USD' })], 'AI');
    b.unidentified.push({
      path: '/synthetic/AI/receipt.png',
      relativePath: 'AI/receipt.png',
      isPdf: false,
      parseFailed: false,
    });
    const result = run(b);
    expect(
      result.findings.some(
        (f) =>
          f.ruleId === 'R3' &&
          f.message.includes('请手填金额和支付日期') &&
          f.files.includes('/synthetic/AI/receipt.png'),
      ),
    ).toBe(true);
    expect(buildReport(result).incompleteGroups).toContain('AI');
  });
  it('AI 空组能在本组找到付款和汇率截图', () => {
    const r = run(batch([], 'AI', ['payment', 'exchangeRate']));
    expect(
      r.groups[0]!.requirements.filter((r) => ['payment', 'exchangeRate'].includes(r.type)).every(
        (r) => r.status === 'found',
      ),
    ).toBe(true);
  });
  it('国内 AI 订阅可由品名识别，仍列出指定材料要求', () => {
    const b = batch([
      invoice({
        lines: [line({ name: '*信息系统服务*Example AI 订阅', taxCategory: '信息系统服务' })],
      }),
    ]);
    const r = run(b);
    expect(r.groups[0]!.invoices[0]!.expenseContent).toBe('资料费');
    expect(r.groups[0]!.requirements.map((r) => r.type)).toEqual(
      expect.arrayContaining(['payment', 'subscription', 'exchangeRate']),
    );
    expect(r.groups[0]!.invoices[0]!.cnyAmount).toBe(100);
  });
  it('汇率类型或支付日不匹配时留空，已找到截图也不能替代数值', () => {
    const b = batch([invoice({ kind: 'foreign', currency: 'USD' })], 'AI', ['exchangeRate']);
    for (const entry of [
      {
        sourceFile: 'a.pdf',
        currency: 'USD',
        amount: 100,
        paymentDate: '2026-01-03',
        exchangeRate: 7,
      },
      {
        sourceFile: 'a.pdf',
        currency: 'USD',
        amount: 100,
        paymentDate: '2026-01-02',
        exchangeRate: 7,
        exchangeRateType: '现钞卖出价',
      },
    ]) {
      b.manual.entries = [entry];
      const r = run(b);
      expect(r.groups[0]!.invoices[0]!.cnyAmount).toBeNull();
      expect(r.findings.some((f) => f.ruleId === 'R10' && f.message.includes('不匹配'))).toBe(true);
    }
  });
  it('手填/解析外币按支付日汇率折算，无汇率留空', () => {
    const b = batch([invoice({ kind: 'foreign', currency: 'USD', total: 20 })], 'AI');
    expect(run(b).groups[0]!.invoices[0]!.cnyAmount).toBeNull();
    b.manual.entries = [
      {
        sourceFile: 'a.pdf',
        amount: 20,
        currency: 'USD',
        paymentDate: '2026-01-02',
        exchangeRate: 700,
        rateBase: 100,
      },
    ];
    expect(run(b).groups[0]!.invoices[0]!.cnyAmount).toBe(140);
  });
  it('支出内容映射及待定告警', () => {
    expect(run(batch()).groups[0]!.expenseContent).toBe('实验材料费');
    const c = config();
    c.expense.default = '自定义材料费';
    expect(checkBatch(batch(), c, {}).groups[0]!.expenseContent).toBe('自定义材料费');
    const b = batch([invoice({ lines: [] })]);
    expect(run(b).groups[0]!.expenseContent).toBe('待定');
    expect(run(b).findings.some((f) => f.ruleId === 'expense')).toBe(true);
  });
  it('独立 XML 未提供税目时保守提示实物要求，并提示人工核对分类', () => {
    const b = batch([
      invoice({ total: 500, lines: [line({ name: '合成器件', taxCategory: '' })] }),
    ]);
    const r = run(b);
    expect(needs(b)).toContain('inventory');
    expect(r.findings.some((f) => f.ruleId === 'parse' && f.message.includes('税目'))).toBe(true);
  });
  it('同组有外币收据不会把国内器件也归为资料费或要求订阅截图', () => {
    const a = invoice({ number: 'SYNTH-CNY' });
    const f = invoice({ number: 'SYNTH-USD', kind: 'foreign', currency: 'USD' });
    const r = run(batch([a, f]));
    const g = r.groups[0]!;
    expect(g.invoices.find((i) => i.invoice.number === a.number)!.expenseContent).toBe(
      '实验材料费',
    );
    expect(g.invoices.find((i) => i.invoice.number === f.number)!.expenseContent).toBe('资料费');
    expect(
      g.requirements.filter((r) => r.type === 'subscription').flatMap((r) => r.invoiceNumbers),
    ).not.toContain(a.number);
  });
  it('报告排除暂缓组、按支出合计、缺汇率单列、按级别排序', () => {
    const b = batch([invoice({ total: 500 })]);
    const d = invoice({ number: 'SYNTH-D', total: 900 });
    b.invoices.push(d);
    b.groups.push({
      ...b.groups[0]!,
      id: '暂缓',
      name: '暂缓',
      invoiceNumbers: [d.number],
      flags: { ...b.groups[0]!.flags, deferred: true },
    });
    const r = buildReport(run(b));
    expect(r.totalCny).toBe(500);
    expect(r.invoiceCount).toBe(2);
    expect(r.deferredGroups).toHaveLength(1);
    const foreign = buildReport(run(batch([invoice({ currency: 'USD', kind: 'foreign' })], 'AI')));
    expect(foreign.unconverted).toHaveLength(1);
    expect(foreign.totalCny).toBe(0);
  });
});
