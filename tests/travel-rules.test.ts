import { expect, it } from 'vitest';
import { checkBatch } from '../src/core/rules/engine.js';
import { loadConfig } from '../src/core/rules/config.js';
import { batch, config, invoice, line } from './helpers.js';
import type { Attachment, Invoice } from '../src/core/types.js';
const ride = (number: string, file: string, total = 20): Invoice =>
  invoice({
    number,
    total,
    lines: [line({ name: '*交通运输服务*客运服务费', taxCategory: '交通运输服务' })],
    sources: [{ path: '/synthetic/交通/' + file, relativePath: '交通/' + file, format: 'pdf' }],
  });
const attachment = (
  file: string,
  amounts: number[] = [],
  directory = '/synthetic/交通',
): Attachment => ({
  path: directory + '/' + file,
  relativePath: '交通/' + file,
  directory,
  type: 'itinerary',
  amounts,
});
const requirements = (invoices: Invoice[], attachments: Attachment[]) => {
  const b = batch(invoices, '交通');
  b.attachments = attachments;
  return checkBatch(b, config()).groups[0]!.requirements.filter((r) => r.type === 'itinerary');
};
it('T1 优先同前缀，再正文/文件名金额，且只能同目录匹配', () => {
  const invoices = [
    ride('SYNTH-A', '【合成甲-20元】电子发票.pdf'),
    ride('SYNTH-B', '乙电子发票.pdf', 30),
  ];
  const files = [
    attachment('【合成甲-20元】电子行程单.pdf'),
    attachment('独立行程单.pdf', [30]),
    attachment('乙电子行程单.pdf', [], '/synthetic/别处'),
  ];
  const r = requirements(invoices, files);
  expect(r).toHaveLength(2);
  expect(r.map((x) => x.status)).toEqual(['found', 'found']);
  expect(r[0]!.foundFiles[0]!.path).toContain('合成甲');
  expect(r[1]!.foundFiles[0]!.path).toContain('独立');
  expect(
    requirements([ride('SYNTH-C', '丙电子发票.pdf', 42)], [attachment('其他-42元-行程单.pdf')])[0]
      ?.status,
  ).toBe('found');
});
it('文件名金额支持千位分隔符', () => {
  expect(
    requirements(
      [ride('SYNTH-C', '丙电子发票.pdf', 1234.5)],
      [attachment('任意-1,234.50元-行程单.pdf')],
    )[0]?.status,
  ).toBe('found');
});
it('T1 无行程单 missing，未匹配行程单 unconfirmed，不复用已分配文件', () => {
  expect(requirements([ride('SYNTH-A', '甲.pdf')], [])[0]?.status).toBe('missing');
  expect(
    requirements([ride('SYNTH-A', '甲.pdf')], [attachment('无法对应行程单.pdf')])[0],
  ).toMatchObject({ status: 'unconfirmed', candidateFiles: [expect.anything()] });
  const r = requirements(
    [ride('SYNTH-A', '甲电子发票.pdf'), ride('SYNTH-B', '乙电子发票.pdf')],
    [attachment('甲电子行程单.pdf', [20])],
  );
  expect(r.map((x) => x.status)).toEqual(['found', 'missing']);
  expect(r.flatMap((x) => x.foundFiles)).toHaveLength(1);
});
it('前缀匹配先于金额全局分配；同金额歧义不随文件顺序任意认定', () => {
  const r = requirements(
    [ride('SYNTH-A', '无前缀.pdf'), ride('SYNTH-B', '特定电子发票.pdf')],
    [attachment('特定电子行程单.pdf', [20])],
  );
  expect(r.map((x) => x.status)).toEqual(['missing', 'found']);
  const ambiguous = requirements(
    [ride('SYNTH-A', '甲.pdf'), ride('SYNTH-B', '乙.pdf')],
    [attachment('共同20元行程单.pdf')],
  );
  expect(ambiguous.every((x) => x.status === 'unconfirmed')).toBe(true);
});
it('T2 快递/同城急送需要同文件夹运单；F2 不按横向目录豁免，规则开关级别生效', () => {
  const i = invoice({
    lines: [line({ name: '*生产生活服务*收派服务费', taxCategory: '生产生活服务' })],
    sources: [
      {
        path: '/synthetic/横向合成/同城急送.pdf',
        relativePath: '横向合成/同城急送.pdf',
        format: 'pdf',
      },
    ],
  });
  const b = batch([i], '横向合成');
  b.attachments = [{ ...attachment('订单详情.pdf', [], '/synthetic/横向合成'), type: 'waybill' }];
  let result = checkBatch(b, config());
  expect(result.findings.some((f) => f.ruleId === 'F2' && f.severity === 'warning')).toBe(true);
  expect(result.groups[0]!.requirements.find((r) => r.type === 'waybill')?.status).toBe('found');
  b.attachments[0]!.directory = '/synthetic';
  expect(
    checkBatch(b, config()).groups[0]!.requirements.find((r) => r.type === 'waybill')?.status,
  ).toBe('missing');
  result = checkBatch(b, loadConfig({ ...config(), ruleOptions: { T2: { enabled: false } } }));
  expect(result.groups[0]!.requirements.some((r) => r.type === 'waybill')).toBe(false);
  expect(
    checkBatch(
      b,
      loadConfig({ ...config(), ruleOptions: { T2: { severity: 'error' } } }),
    ).findings.find((f) => f.ruleId === 'T2')?.severity,
  ).toBe('error');
  expect(requirements([invoice()], [])).toEqual([]);
});
it('升级旧默认词表补入新关键字，保留用户自定义词表', () => {
  const full = loadConfig();
  const { T1, T2, ...oldRules } = full.ruleOptions;
  const old = {
    ...full,
    ruleOptions: oldRules,
    horizontalOnlyKeywords: full.horizontalOnlyKeywords.slice(0, -7),
    attachmentKeywords: { ...full.attachmentKeywords, waybill: ['运单明细', '顺丰行程单'] },
  };
  expect(loadConfig(old).horizontalOnlyKeywords).toContain('交通运输服务');
  expect(loadConfig(old).attachmentKeywords.waybill).toContain('订单详情');
  expect(
    loadConfig({ ...old, horizontalOnlyKeywords: ['合成自定义'] }).horizontalOnlyKeywords,
  ).toEqual(['合成自定义']);
});
