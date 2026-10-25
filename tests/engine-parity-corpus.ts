import type { AttachmentType, Batch, CheckContext, Invoice } from '../src/core/types.js';
import type { RuleConfig } from '../src/core/rules/config.js';
import { batch, config, finding, invoice, line } from './helpers.js';

export interface ParityScenario {
  name: string;
  batch: Batch;
  config: RuleConfig;
  context: CheckContext;
}
const categories = ['电子元件', '生活服务', '研发和技术服务', 'mixed', '', '免税服务'];
const attachmentTypes: AttachmentType[] = [
  'inventory',
  'payment',
  'verification',
  'designList',
  'repairList',
  'contract',
  'acceptanceNote',
  'store',
  'purposeNote',
  'waybill',
  'itinerary',
  'exchangeRate',
  'subscription',
  'systemApproval',
  'highValueApproval',
  'assetRegistration',
  'explanation',
];
function sample(
  n: number,
  currency: string,
  kind: Invoice['kind'],
  name: string,
  amount: number,
): Batch {
  const category = categories[n % categories.length]!;
  const lines =
    category === 'mixed'
      ? [line({ taxCategory: '电子元件' }), line({ name: '加工', taxCategory: '研发和技术服务' })]
      : [
          line({
            name: ['器件', '仪器', '亚克力', '办公用品', '快递', '市内交通', 'AI订阅'][n % 7],
            taxCategory: category,
            grossUnitPrice: amount,
            amount,
            tax: n % 2 ? 13 : null,
          }),
        ];
  const make = (suffix: string, total: number) =>
    invoice({
      number: `PARITY-${n}-${suffix}`,
      kind,
      currency,
      total,
      lines,
      sources: [
        {
          path: `/synthetic/${name}/${suffix}.pdf`,
          relativePath: `${name}/${suffix}.pdf`,
          format: 'pdf',
        },
      ],
    });
  const b = batch([make('a', amount), ...(n % 3 === 0 ? [make('b', amount)] : [])], name);
  const location = n % 6;
  if (location) {
    const directory =
      location === 2 ? b.dir : location === 3 ? `${b.dir}/入库材料` : b.groups[0]!.dir;
    b.attachments = (location === 5 ? ['unnamed' as const] : attachmentTypes).map((type, i) => ({
      type,
      directory,
      path: `${directory}/附件${i}.jpg`,
      relativePath: `${directory.slice(b.dir.length + 1)}/附件${i}.jpg`,
      ...(type === 'itinerary' ? { amounts: [amount] } : {}),
    }));
    if (location === 4)
      b.attachments.forEach((a) => {
        a.directory = `${b.dir}/其他组`;
        a.path = `${a.directory}/附件.jpg`;
      });
  }
  if (n % 4 === 0)
    b.manual.entries.push({
      number: b.invoices[0]!.number,
      currency,
      amount,
      paymentDate: b.invoices[0]!.date,
      exchangeRate: 7.2,
      rateBase: n % 8 === 0 ? 100 : 1,
    });
  return b;
}
export function parityCorpus(): ParityScenario[] {
  const scenarios: ParityScenario[] = [];
  const add = (name: string, b: Batch, c = config(), context: CheckContext = {}) =>
    scenarios.push({ name, batch: b, config: c, context });
  let n = 0;
  for (const currency of ['CNY', 'USD'])
    for (const kind of ['domestic', 'foreign', 'manual'] as const)
      for (const name of ['普通', '暂缓', '公转', '外包', 'AI'])
        for (const [key, threshold] of Object.entries(config().thresholds))
          for (const delta of [-0.01, 0, 0.01]) {
            add(
              `${currency}-${kind}-${name}-${key}-${delta}`,
              sample(n++, currency, kind, name, threshold.value + delta),
            );
          }
  // 种子固定，额外组合税目、金额、附件位置、来源格式和手填匹配状态。
  let seed = 7139;
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  for (let j = 0; j < 180; j++) {
    const c = config();
    const threshold = Object.values(c.thresholds)[random(6)]!;
    threshold.operator = random(2) ? '>' : '>=';
    const b = sample(
      n++,
      random(2) ? 'CNY' : 'USD',
      ['domestic', 'foreign', 'manual'][random(3)]! as Invoice['kind'],
      ['普通', '公转外包', 'AI', 'AI其他'][random(4)]!,
      threshold.value + random(3) - 1,
    );
    const i = b.invoices[0]!;
    if (random(3) === 0) i.date = '';
    if (random(3) === 0) i.seller.taxId = '';
    if (random(3) === 0) i.buyer.name = '其他单位';
    if (random(4) === 0) i.lines = [];
    if (random(3) === 0) i.warnings = ['合成解析警告'];
    if (random(3) === 0) i.text = '电子普通发票';
    if (random(3) === 0) i.invoiceType = 'legacy';
    if (random(4) === 0)
      b.manual.entries.push({
        number: i.number,
        currency: 'EUR',
        amount: i.total,
        paymentDate: '2026-02-03',
        exchangeRate: 7,
      });
    add(`seed-${j}`, b, c);
  }
  for (const key of Object.keys(config().ruleOptions) as (keyof RuleConfig['ruleOptions'])[])
    for (const mode of ['off', 'error', 'info'] as const) {
      const c = config();
      if (mode === 'off') c.ruleOptions[key].enabled = false;
      else c.ruleOptions[key].severity = mode;
      c.mixedDelegatedSeverity = mode === 'info' ? 'info' : 'warning';
      const b = sample(n++, 'USD', 'domestic', '公转外包', 50000);
      b.invoices.push(
        invoice({ number: `OPTION-${key}`, total: 60000, lines: [line({ grossUnitPrice: 2000 })] }),
      );
      b.groups[0]!.invoiceNumbers = b.invoices.map((i) => i.number);
      add(`option-${key}-${mode}`, b, c, {
        submittedHistory: new Set(b.invoices.map((i) => i.number)),
        rejectedNumbers: new Set(b.invoices.map((i) => i.number)),
      });
    }
  for (const identity of ['tax', 'name', 'unique', 'ambiguous', 'missing', 'date', 'whitespace']) {
    const invoices = [0, 1, 2].map((index) =>
      invoice({
        number: `SPLIT-${index}`,
        total: index === 2 ? 600 : 300,
        seller: {
          name: identity === 'missing' ? '' : '合成公司',
          taxId: identity === 'tax' ? 'SELLER' : '',
        },
        sources: [
          {
            path: `/synthetic/${index === 2 ? '另一组' : '公转'}/${index}.pdf`,
            relativePath: `${index}.pdf`,
            format: 'pdf',
          },
        ],
      }),
    );
    if (identity === 'unique' || identity === 'ambiguous') invoices[1]!.seller.taxId = 'ONE';
    if (identity === 'ambiguous') invoices[2]!.seller.taxId = 'TWO';
    if (identity === 'date') invoices[0]!.date = '';
    if (identity === 'whitespace') invoices[0]!.seller.name = '合 成 公 司';
    const b = batch(invoices, '公转');
    b.groups[0]!.invoiceNumbers = invoices.slice(0, 2).map((i) => i.number);
    const other = batch([invoices[2]!], '另一组').groups[0]!;
    b.groups.push(other);
    add(`seller-${identity}`, b);
  }
  for (const name of ['AI', '普通'])
    for (const images of [false, true]) {
      const b = batch([], name);
      if (images)
        b.unidentified.push({
          path: `/synthetic/${name}/截图.png`,
          relativePath: `${name}/截图.png`,
          isPdf: false,
          parseFailed: false,
        });
      add(`empty-${name}-${images}`, b);
      const withInvoice = structuredClone(b);
      withInvoice.invoices = [invoice()];
      withInvoice.groups[0]!.invoiceNumbers = [withInvoice.invoices[0]!.number];
      add(`images-${name}-${images}`, withInvoice);
    }
  for (const variant of [
    'formats',
    'same-format',
    'directories',
    'manual',
    'recorded',
    'inferred',
    'history',
    'other',
    'submitted',
    'self',
  ]) {
    const b = batch();
    const i = b.invoices[0]!;
    const context: CheckContext = {};
    if (['formats', 'same-format', 'directories', 'manual'].includes(variant))
      i.sources.push({
        path: `/synthetic/${variant === 'directories' ? '另一组' : '根目录'}/second.${variant === 'formats' ? 'xml' : 'pdf'}`,
        relativePath: 'second.pdf',
        format: variant === 'formats' ? 'xml' : variant === 'manual' ? 'manual' : 'pdf',
      });
    if (variant === 'manual')
      b.diagnostics.push(
        finding({
          ruleId: 'dup',
          message: '手填条目重复',
          invoiceNumbers: [i.number],
          files: ['manual.json'],
        }),
      );
    if (variant === 'history') context.submittedHistory = new Set([i.number]);
    if (['other', 'submitted', 'self'].includes(variant))
      context.otherBatches = [
        {
          ...batch(),
          id: variant === 'self' ? b.id : '另一批',
          submitted: variant === 'submitted',
        },
      ];
    if (variant === 'recorded' || variant === 'inferred')
      context.rejectedInfo = new Map([
        [
          i.number,
          {
            number: i.number,
            inferred: variant === 'inferred' ? [{ ruleId: 'R1', name: '材料缺失' }] : [],
            ...(variant === 'recorded'
              ? {
                  recorded: {
                    number: i.number,
                    reason: '合成拒票',
                    recordedAt: '2026-01-02',
                    file: '合成记录',
                  },
                }
              : {}),
          },
        ],
      ]);
    add(`cross-${variant}`, b, config(), context);
  }
  for (const ruleId of ['parse', 'manual', 'ofd', 'unrecognized-pdf']) {
    const b = batch();
    b.diagnostics.push(
      finding({
        ruleId,
        message: `合成诊断 ${b.invoices[0]!.sources[0]!.path}`,
        invoiceNumbers: [b.invoices[0]!.number],
        files: [b.invoices[0]!.sources[0]!.path],
      }),
    );
    add(`diagnostic-${ruleId}`, b);
  }
  return scenarios;
}
