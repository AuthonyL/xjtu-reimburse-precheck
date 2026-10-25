import type { Attachment, Invoice } from '../src/core/types.js';
import { batch, config, invoice, line } from './helpers.js';
import type { ParityScenario } from './engine-parity-corpus.js';

export function edgeCorpus(): ParityScenario[] {
  const result: ParityScenario[] = [];
  const add = (name: string, b: ReturnType<typeof batch>, c = config()) =>
    result.push({ name, batch: b, config: c, context: {} });
  for (const key of Object.keys(config().thresholds) as (keyof ReturnType<
    typeof config
  >['thresholds'])[])
    for (const operator of ['>=', '>'] as const)
      for (const delta of [-0.01, -1e-9, 0, 1e-9, 0.01]) {
        const c = config();
        c.thresholds[key].operator = operator;
        const total = c.thresholds[key].value + delta;
        const b = batch(
          [invoice({ total, lines: [line({ grossUnitPrice: total })] })],
          key === 'outsourcedContract' ? '委托' : '公转',
        );
        add(`edge-${key}-${operator}-${delta}`, b, c);
        if (key === 'inventory' || key === 'payment') {
          const split = structuredClone(b);
          split.invoices[0]!.total = total / 2;
          split.invoices.push({ ...structuredClone(split.invoices[0]!), number: 'SPLIT-SECOND' });
          split.groups[0]!.invoiceNumbers.push('SPLIT-SECOND');
          add(`edge-split-${key}-${operator}-${delta}`, split, c);
        }
      }
  for (const amounts of [
    [166.665, 166.665, 166.665],
    [0.005, 499.99],
    [333.333, 333.333, 333.333],
  ]) {
    const invoices = amounts.map((total, n) => invoice({ number: `ROUND-${n}`, total }));
    add(`incremental-rounding-${amounts.join('-')}`, batch(invoices));
  }
  for (const types of ['mixed', 'all', 'empty', 'ai', 'foreign', 'missing', 'names'] as const) {
    const base = invoice({
      number: 'SERVICE',
      total: 50000,
      lines: [line({ taxCategory: '测试服务' })],
    });
    const second = invoice({
      number: 'OTHER',
      total: 50000,
      lines: [line({ taxCategory: '电子元件' })],
    });
    if (types === 'mixed') base.lines.push(line({ amount: null, tax: null }));
    if (types === 'all') base.lines = [line()];
    if (types === 'empty') base.lines = [];
    if (types === 'ai') second.lines[0]!.name = 'ChatGPT';
    if (types === 'foreign') second.currency = 'USD';
    if (types === 'missing' || types === 'names') {
      base.lines[0]!.taxCategory = '';
      base.lines[0]!.name = types === 'names' ? '器件' : '测试服务';
      base.sources[0]!.relativePath = '测试服务.pdf';
    }
    add(`delegated-${types}`, batch([base, second], '公转委托'));
  }
  for (const instrument of [false, true]) {
    const b = batch([
      invoice({
        total: 12000,
        lines: [
          line({ name: instrument ? '仪器' : '器件', grossUnitPrice: 2000 }),
          line({ name: '器件', grossUnitPrice: 2000, discount: true }),
        ],
      }),
    ]);
    add(`high-value-mixture-${instrument}`, b);
  }
  for (const name of ['AI', 'ai', 'AI其他', '普通']) {
    const b = batch(
      [
        invoice({ total: 700, lines: [line({ name: 'ChatGPT' })] }),
        invoice({ number: 'SECOND', total: 700 }),
      ],
      name,
    );
    add(`payment-subset-${name}`, b);
    for (const flags of [false, true]) {
      const flagged = structuredClone(b);
      flagged.groups[0]!.flags.ai = flags;
      flagged.attachments.push({
        type: 'unnamed',
        path: `/synthetic/${name}/未知.png`,
        relativePath: `${name}/未知.png`,
        directory: `/synthetic/${name}`,
      });
      add(`ai-flag-${name}-${flags}`, flagged);
    }
  }
  for (const manualMatch of [
    'number',
    'source',
    'group',
    'currency',
    'date',
    'type',
    'zero',
    'none',
  ])
    for (const disabled of [false, true]) {
      const b = batch(
        [invoice({ number: 'manual:AI:1', kind: 'manual', currency: 'USD', total: 20 })],
        'AI',
      );
      const c = config();
      c.ruleOptions.R3.enabled = c.ruleOptions.R10.enabled = !disabled;
      if (manualMatch !== 'none')
        b.manual.entries.push({
          ...(manualMatch === 'source'
            ? { sourceFile: b.invoices[0]!.sources[0]!.relativePath }
            : manualMatch === 'group'
              ? { group: 'AI' }
              : { number: b.invoices[0]!.number }),
          currency: manualMatch === 'currency' ? 'EUR' : 'USD',
          amount: 20,
          paymentDate: manualMatch === 'date' ? '2026-01-03' : '2026-01-02',
          exchangeRate: manualMatch === 'zero' ? 0 : 720,
          rateBase: 100,
          ...(manualMatch === 'type' ? { exchangeRateType: '其他' } : {}),
        });
      add(`manual-match-${manualMatch}-${disabled}`, b, c);
    }
  const ride = (number: string, prefix: string, total = 20): Invoice =>
    invoice({
      number,
      total,
      lines: [line({ name: '客运服务费', taxCategory: '交通运输服务' })],
      sources: [
        {
          path: `/synthetic/交通/${prefix}电子发票.pdf`,
          relativePath: `交通/${prefix}电子发票.pdf`,
          format: 'pdf',
        },
      ],
    });
  const itinerary = (
    prefix: string,
    amounts: number[] = [],
    directory = '/synthetic/交通',
  ): Attachment => ({
    type: 'itinerary',
    path: `${directory}/${prefix}行程单.pdf`,
    relativePath: `${prefix}行程单.pdf`,
    directory,
    amounts,
  });
  for (const variant of [
    'prefix',
    'amount',
    'ambiguous',
    'unused',
    'wrong-directory',
    'global-prefix',
  ]) {
    const b = batch(
      [ride('RIDE-A', '甲'), ride('RIDE-B', variant === 'global-prefix' ? '特定' : '乙')],
      '交通',
    );
    b.attachments =
      variant === 'prefix'
        ? [itinerary('甲'), itinerary('乙')]
        : variant === 'amount'
          ? [itinerary('无法对应', [20]), itinerary('金额不同', [30])]
          : variant === 'ambiguous'
            ? [itinerary('共同20元')]
            : variant === 'unused'
              ? [itinerary('无法对应')]
              : variant === 'wrong-directory'
                ? [itinerary('甲', [20], '/synthetic')]
                : [itinerary('特定', [20])];
    add(`travel-${variant}`, b);
  }
  for (const location of ['root', 'materials', 'local', 'other', 'unnamed']) {
    const b = batch(
      [invoice({ total: 50000, lines: [line({ name: '亚克力 办公用品', grossUnitPrice: 2000 })] })],
      '委托',
    );
    b.invoices[0]!.sources[0]!.path = '/synthetic/委托/a.pdf';
    const directory =
      location === 'root'
        ? b.dir
        : location === 'materials'
          ? `${b.dir}/入库材料`
          : location === 'other'
            ? `${b.dir}/其他`
            : `${b.dir}/委托`;
    const types =
      location === 'unnamed'
        ? ['unnamed' as const]
        : (['inventory', 'payment', 'repairList'] as const);
    b.attachments = types.map((type) => ({
      type,
      path: `${directory}/${type}.png`,
      relativePath: `${type}.png`,
      directory,
    }));
    add(`materials-${location}`, b);
  }
  const groupless = batch();
  groupless.groups = [];
  add('invoices-without-group', groupless);
  const allOff = config();
  Object.values(allOff.ruleOptions).forEach((option) => {
    option.enabled = false;
  });
  add('all-disabled-conversion', batch([invoice({ currency: 'USD' })], 'AI'), allOff);
  const literals = config();
  literals.expense.outsourced = '委托{dayTotal}';
  literals.exchangeRateType = '牌价{groupTotal}';
  add(
    'literal-config-braces',
    batch(
      [
        invoice({ lines: [line({ taxCategory: '测试服务' })] }),
        invoice({ number: 'LITERAL-USD', currency: 'USD' }),
      ],
      '委托',
    ),
    literals,
  );
  return result;
}
