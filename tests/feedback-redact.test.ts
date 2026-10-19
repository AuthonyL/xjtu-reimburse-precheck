import { expect, it } from 'vitest';
import {
  createRedactionContext,
  redactText,
  redactItems,
  redactValue,
} from '../src/core/feedback/redact.js';
import { invoiceFromTextItems } from '../src/core/parse/pdf.js';
import { pdfItems, item } from './parse-fixtures.js';
it('身份证/手机/银行卡及掩码/邮箱脱敏，税号、公司、金额日期保留，同人同代号', () => {
  const ctx = createRedactionContext({
    names: ['林示例', '陈示例'],
    protectedTexts: ['12100000435230200R', '123456789012345678', '林示例公司'],
  });
  const text = redactText(
    '林示例 陈示例 林示例 31010119900101123X 13912345678 6222021234567890123 6222 **** **** 1234 a.person@example.test 12100000435230200R 123456789012345678 林示例公司 113.00 2026-01-02',
    ctx,
  );
  for (const secret of [
    '31010119900101123X',
    '13912345678',
    '6222021234567890123',
    '6222 **** **** 1234',
    'a.person@example.test',
  ])
    expect(text).not.toContain(secret);
  expect(text).toContain('人员A');
  expect(text).toContain('人员B');
  for (const kept of [
    '12100000435230200R',
    '123456789012345678',
    '林示例公司',
    '113.00',
    '2026-01-02',
  ])
    expect(text).toContain(kept);
  expect(redactValue({ '林示例/说明.docx': '林示例' }, ctx)).toEqual({
    '人员A/说明.docx': '人员A',
  });
});
it('跨相邻文字项的号码和姓名脱敏，保留每项位置宽高和全部非人名发票字段', () => {
  const items = [
    ...pdfItems(),
    item('开票人：', 20, 240),
    item('林', 60, 240),
    item('示例', 65, 240),
    item('13912', 20, 260),
    item('345678', 45, 260),
  ];
  const ctx = createRedactionContext({
    names: ['林示例'],
    protectedTexts: ['SYNTHBUYER00000001', 'SYNTHSELLER0000001'],
  });
  const result = redactItems(items, ctx);
  expect(result.map((i) => i.str).join('')).not.toContain('林示例');
  expect(result.map((i) => i.str).join('')).not.toContain('13912345678');
  expect(result.map(({ str, ...position }) => position)).toEqual(
    items.map(({ str, ...position }) => position),
  );
  const before = invoiceFromTextItems(items, '合成.pdf')!;
  const after = invoiceFromTextItems(result, '合成.pdf')!;
  expect({ ...after, text: undefined, remarks: undefined }).toEqual({
    ...before,
    text: undefined,
    remarks: undefined,
  });
});
it('从开票人/出行人文字发现姓名，XML实体中的联系方式也隐藏', () => {
  const ctx = createRedactionContext({ texts: ['开票人：林示例 出行人：陈示例'], names: [] });
  expect(redactText('开票人：林示例 出行人：陈示例', ctx)).not.toMatch(/林示例|陈示例/);
});
it('XML 文本和属性里的数字实体/掩码/姓名都脱敏，税号保留', async () => {
  const { redactXml } = await import('../src/core/feedback/redact.js');
  const ctx = createRedactionContext({ names: ['林示例'], protectedTexts: ['123456789012345678'] });
  const input =
    '<EInvoice contact="a&#64;example.test"><Name>林示例</Name><Phone>&#49;3912345678</Phone><TaxId>123456789012345678</TaxId></EInvoice>';
  const output = redactXml(input, ctx);
  expect(output).not.toContain('林示例');
  expect(output).not.toContain('13912345678');
  expect(output).not.toContain('a@example.test');
  expect(output).toContain('123456789012345678');
});
it('多页文字项不串行、多个号码同一项都隐藏，空文字项不改变', () => {
  const items = [
    item('13912345678 a@example.test', 10, 10),
    { ...item('13912', 10, 20), page: 1 },
    { ...item('345678', 35, 20), page: 2 },
    item('', 0, 0),
  ];
  const result = redactItems(items, createRedactionContext());
  expect(result[0]!.str).not.toMatch(/13912345678|a@example/);
  expect(result[1]!.str).toBe('13912');
  expect(result[2]!.str).toBe('345678');
  expect(result[3]!.str).toBe('');
});
it('从分散的开票人文字项发现姓名，再按相同代号替换', async () => {
  const { redactionTextRuns } = await import('../src/core/feedback/redact.js');
  const items = [item('开票人：', 10, 20), item('林', 40, 20), item('示例', 45, 20)];
  const ctx = createRedactionContext({ texts: redactionTextRuns(items) });
  expect(
    redactItems(items, ctx)
      .map((i) => i.str)
      .join(''),
  ).toBe('开票人：人员A');
});
it('XML 的开票人标签、字段和数字实体姓名可被发现并脱敏', async () => {
  const { redactXml } = await import('../src/core/feedback/redact.js');
  const xml =
    '<EInvoice><Remark>开票人：林示例</Remark><Drawer>陈示例</Drawer><PassengerName>&#26519;示例</PassengerName></EInvoice>';
  const ctx = createRedactionContext({ texts: [xml] });
  const result = redactXml(xml, ctx);
  expect(result).not.toContain('林示例');
  expect(result).not.toContain('陈示例');
  expect(result).not.toContain('&#26519;');
  expect(result).toContain('人员');
});
it('带分隔符的手机/银行卡和全前缀掩码也隐藏，日期金额保留', () => {
  const ctx = createRedactionContext({ protectedTexts: ['123456789012345678', '113.00'] });
  for (const secret of [
    '139-1234-5678',
    '139 1234 5678',
    '6222 0212 3456 7890 123',
    '6222-0212-3456-7890',
    '**** **** **** 1234',
    '****1234',
    '622202******1234',
  ])
    expect(redactText(secret, ctx)).not.toContain(secret);
  expect(redactText('2026-01-02 113.00 123456789012345678', ctx)).toBe(
    '2026-01-02 113.00 123456789012345678',
  );
});
it('明确的开票人/出行人字段支持英文姓名', async () => {
  const { redactXml } = await import('../src/core/feedback/redact.js');
  const xml =
    '<EInvoice><Drawer>Alice Example</Drawer><PassengerName>Bob Sample</PassengerName></EInvoice>';
  const ctx = createRedactionContext({ texts: [xml, '开票人：Carol Example'] });
  expect(redactXml(xml, ctx)).not.toMatch(/Alice Example|Bob Sample/);
  expect(redactText('开票人：Carol Example', ctx)).not.toContain('Carol Example');
});
