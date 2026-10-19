import { expect, it } from 'vitest';
import { checkBatch, loadConfig } from '../src/core/index.js';
import { batch, config, invoice, line } from './helpers.js';
import { identifyAttachment } from '../src/core/attachments.js';
import { parseInvoiceXml } from '../src/core/parse/xml.js';
import { invoiceFromTextItems } from '../src/core/parse/pdf.js';
import { parseForeignText } from '../src/core/parse/foreign.js';
import { pdfItems, xml } from './parse-fixtures.js';

it.each([
  '文具',
  '教具',
  '教学用具',
  '办公用品',
  '打印',
  '复印',
  '印刷',
  '快递服务',
  '收派服务',
  '邮政',
  '邮寄',
  '当天达',
  '客运',
  '出租',
  '网约车',
  '地铁',
  '公交',
])('F2 %s 只提示横向限制，包含文件名兜底', (keyword) => {
  for (const useFile of [false, true]) {
    const i = invoice({ lines: useFile ? [] : [line({ name: keyword })] });
    if (useFile) i.sources[0]!.relativePath = keyword + '.pdf';
    const result = checkBatch(batch([i]), config());
    expect(result.findings.some((f) => f.ruleId === 'F2' && f.severity === 'warning')).toBe(true);
    expect(result.findings.some((f) => f.ruleId === 'R14')).toBe(false);
    expect(result.findings.find((f) => f.ruleId === 'F2')!.action).toContain('单独走横向');
  }
  expect(checkBatch(batch(), config()).findings.some((f) => f.ruleId === 'F2')).toBe(false);
});

it.each(['办公用品', '文具', '日用杂品', '日用品', '生活用品', '清洁用品', '洗涤剂'])(
  'F6 %s 需要用途说明',
  (name) => {
    const b = batch([invoice({ lines: [line({ name })] })]);
    expect(
      checkBatch(b, config()).groups[0]!.requirements.some((r) => r.type === 'purposeNote'),
    ).toBe(true);
    expect(
      checkBatch(batch(), config()).groups[0]!.requirements.some((r) => r.type === 'purposeNote'),
    ).toBe(false);
  },
);

it.each(['外包', '委托', '加工', '测试'])('F5 %s 组要求清单、材料税目报错，AI 除外', (name) => {
  const result = checkBatch(batch([invoice()], name), config());
  expect(result.groups[0]!.expenseContent).toBe('委托业务费');
  expect(result.groups[0]!.requirements.some((r) => r.type === 'designList')).toBe(true);
  expect(result.findings.some((f) => f.ruleId === 'F5' && f.severity === 'error')).toBe(true);
  const ai = batch([invoice()], 'AI');
  ai.groups[0]!.flags.outsourced = true;
  expect(checkBatch(ai, config()).findings.some((f) => f.ruleId.startsWith('F5'))).toBe(false);
});

it.each(['设计服务', '研发和技术服务', '测试服务', '检测服务', '加工', '技术服务'])(
  'F5 税目 %s 识别委托并允许服务发票',
  (taxCategory) => {
    const result = checkBatch(batch([invoice({ lines: [line({ taxCategory })] })]), config());
    expect(result.groups[0]!.group.flags.outsourced).toBe(true);
    expect(result.groups[0]!.expenseContent).toBe('委托业务费');
    expect(result.findings.some((f) => f.ruleId === 'F5')).toBe(false);
  },
);

it.each([49999.99, 50000])('委托五万边界 %s，合同和验收说明按组合计', (amount) => {
  const invoices = [
    invoice({ total: amount / 2 }),
    invoice({ number: 'SYNTH-SECOND', total: amount / 2 }),
  ];
  const result = checkBatch(batch(invoices, '委托'), config());
  for (const type of ['contract', 'acceptanceNote']) {
    const requirements = result.groups[0]!.requirements.filter((r) => r.type === type);
    expect(requirements.length).toBe(amount >= 50000 ? 1 : 0);
    if (requirements.length) expect(requirements[0]!.invoiceNumbers).toHaveLength(2);
  }
});

it('F1 旧版票提示盖章，数电票不提示；关闭和级别可配置', () => {
  const legacy = batch([invoice({ invoiceType: 'legacy' })]);
  expect(checkBatch(legacy, config()).findings.find((f) => f.ruleId === 'F1')?.severity).toBe(
    'info',
  );
  expect(checkBatch(batch(), config()).findings.some((f) => f.ruleId === 'F1')).toBe(false);
  const c = config();
  c.ruleOptions.F1.enabled = false;
  expect(checkBatch(legacy, c).findings.some((f) => f.ruleId === 'F1')).toBe(false);
  c.ruleOptions.F1.enabled = true;
  c.ruleOptions.F1.severity = 'error';
  expect(checkBatch(legacy, c).findings.find((f) => f.ruleId === 'F1')?.severity).toBe('error');
});

it('R1/R11 action 含分组路径，关闭规则不生成材料；旧 forbiddenKeywords 合并到 F2', () => {
  const b = batch([invoice({ total: 500 })], '合成器件组');
  const c = config();
  expect(checkBatch(b, c).findings.find((f) => f.ruleId.includes('R1'))!.action).toContain(
    '合成器件组',
  );
  c.ruleOptions.R1.enabled = false;
  c.ruleOptions.R11.enabled = false;
  expect(checkBatch(b, c).groups[0]!.requirements.some((r) => r.type === 'inventory')).toBe(false);
  const migrated = loadConfig({ forbiddenKeywords: ['合成限制词'] });
  expect(migrated.horizontalOnlyKeywords).toContain('文具');
  expect(migrated.horizontalOnlyKeywords).toContain('合成限制词');
  migrated.ruleOptions.F2.severity = 'error';
  const special = batch([invoice({ lines: [line({ name: '合成限制词' })] })]);
  expect(checkBatch(special, migrated).findings.find((f) => f.ruleId === 'F2')?.severity).toBe(
    'error',
  );
});

it('完整旧默认配置升级后包含新的委托税目与分组词，自定义空列表可保留', () => {
  const upgraded = loadConfig({
    designKeywords: ['设计服务', '电路设计服务'],
    groupKeywords: { outsourced: ['外包'] },
    forbiddenKeywords: ['文具'],
  });
  expect(upgraded.designKeywords).toContain('研发和技术服务');
  expect(upgraded.groupKeywords.outsourced).toContain('委托');
  const current = config();
  current.designKeywords = [];
  expect(loadConfig(current).designKeywords).toEqual([]);
});

it('用途、验收与明细识别兼容维修清单，找到的用途说明不再缺失', () => {
  expect(identifyAttachment('合成用途说明.pdf')).toBe('purposeNote');
  expect(identifyAttachment('合成验收合格说明.pdf')).toBe('acceptanceNote');
  expect(identifyAttachment('合成盖章明细.pdf')).toBe('designList');
  const b = batch([invoice({ lines: [line({ name: '文具' })] })], '根目录', ['purposeNote']);
  expect(
    checkBatch(b, config()).groups[0]!.requirements.find((r) => r.type === 'purposeNote')?.status,
  ).toBe('found');
  const repair = batch([invoice({ lines: [line({ taxCategory: '测试服务' })] })], '公转维修', [
    'repairList',
  ]);
  repair.invoices[0]!.sources[0]!.path = '/synthetic/公转维修/one.pdf';
  repair.invoices[0]!.sources[0]!.relativePath = '公转维修/one.pdf';
  expect(
    checkBatch(repair, config()).groups[0]!.requirements.find((r) => r.type === 'designList')
      ?.status,
  ).toBe('found');
});

it('PDF/XML/海外票记录票种，PDF 根据原始文字识别旧版，开关能屏蔽所有规则输出', () => {
  const digital = invoiceFromTextItems(pdfItems(), 'digital.pdf')!;
  const legacy = invoiceFromTextItems(
    [...pdfItems(), { str: '发票代码：SYNTH-CODE', x: 20, y: 35, width: 100, height: 10, page: 1 }],
    'legacy.pdf',
  )!;
  expect(digital.invoiceType).toBe('digital');
  expect(legacy.invoiceType).toBe('legacy');
  expect(parseInvoiceXml(xml, 'synthetic.xml')?.invoiceType).toBe('digital');
  expect(
    parseForeignText(
      'Receipt\nReceipt number SYNTH-FOREIGN\nDate paid 2026-01-02\nAmount paid $20.00',
      'receipt.pdf',
    )?.invoiceType,
  ).toBe('foreign');
  const c = config();
  for (const rule of Object.values(c.ruleOptions)) rule.enabled = false;
  const result = checkBatch(batch([legacy], '委托'), c, {
    rejectedNumbers: new Set([legacy.number]),
    submittedHistory: new Set([legacy.number]),
  });
  expect(result.findings).toEqual([]);
  expect(result.groups[0]!.requirements).toEqual([]);
});

it('混合组 AI 订阅不进入委托清单目标和五万合同合计', () => {
  const service = invoice({
    number: 'SYNTH-SERVICE',
    total: 100,
    lines: [line({ taxCategory: '测试服务' })],
  });
  const ai = invoice({
    number: 'SYNTH-AI',
    total: 49900,
    lines: [line({ taxCategory: '技术服务', name: '*技术服务*ChatGPT订阅' })],
  });
  const result = checkBatch(batch([service, ai]), config());
  const requirements = result.groups[0]!.requirements;
  expect(requirements.find((r) => r.type === 'designList')?.invoiceNumbers).toEqual([
    'SYNTH-SERVICE',
  ]);
  expect(requirements.some((r) => r.type === 'contract' || r.type === 'acceptanceNote')).toBe(
    false,
  );
  const c = config();
  c.thresholds.outsourcedContract.value = 100;
  const required = checkBatch(batch([service, ai]), c).groups[0]!.requirements;
  for (const type of ['contract', 'acceptanceNote'])
    expect(required.find((r) => r.type === type)?.invoiceNumbers).toEqual(['SYNTH-SERVICE']);
});

it.each([
  '生产生活服务',
  '研发和技术服务',
  '现代服务',
  '劳务',
  '加工',
  '加工服务',
  '加工劳务',
  '加工费',
  '电路测试服务费',
])('服务税目 %s 不误触发实物入库和高值材料', (taxCategory) => {
  const result = checkBatch(
    batch(
      [invoice({ total: 50000, lines: [line({ taxCategory, grossUnitPrice: 50000 })] })],
      '委托',
    ),
    config(),
  );
  expect(
    result.groups[0]!.requirements.some((r) =>
      ['inventory', 'highValueApproval', 'assetRegistration', 'systemApproval'].includes(r.type),
    ),
  ).toBe(false);
  expect(result.findings.some((f) => f.ruleId === 'F5')).toBe(false);
});

it('金属加工机械是实物，不能因加工子串被豁免；委托组开此税目仍报 F5', () => {
  const machine = invoice({
    total: 50000,
    lines: [
      line({
        taxCategory: '金属加工机械',
        name: '*金属加工机械*合成数控机床',
        grossUnitPrice: 50000,
      }),
    ],
  });
  const result = checkBatch(batch([machine]), config());
  expect(result.groups[0]!.expenseContent).toBe('实验材料费');
  for (const type of ['inventory', 'highValueApproval', 'systemApproval'])
    expect(result.groups[0]!.requirements.some((r) => r.type === type)).toBe(true);
  expect(
    checkBatch(batch([machine], '委托'), config()).findings.some(
      (f) => f.ruleId === 'F5' && f.severity === 'error',
    ),
  ).toBe(true);
});
