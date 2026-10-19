import { expect, it } from 'vitest';
import { invoiceFromTextItems, type PdfTextItem } from '../src/core/parse/pdf.js';
import { item, pdfItems, row } from './parse-fixtures.js';
const fieldItems = (): PdfTextItem[] => [
  item('电子发票(普通发票)', 210, 45),
  item('发票号码:', 455, 33),
  item('SYNTH-LAYOUT', 505, 33),
  item('开票日期:', 455, 48.5),
  item('2026年06月08日', 505, 47.5),
  item('购', 26, 94),
  item('买', 26, 105),
  item('方', 26, 116),
  item('销', 312, 94),
  item('售', 312, 105),
  item('方', 312, 116),
  item('名', 41, 104),
  item('称', 55, 104),
  item(':', 64, 104),
  item('合成大学', 71, 104),
  item('名', 326, 104),
  item('称', 340, 104),
  item(':', 349, 104),
  item('合成电子公司', 356, 104),
  item('统一社会信用代码/纳税人识别号:', 41, 131),
  item('SYNTHBUYER', 41, 142),
  item('00000001', 105, 142),
  item('统一社会信用代码/纳税人识别号:', 326, 131),
  item('SYNTHSELLER0000001', 326, 142),
  ...row(160, ['项目名称', '规格型号', '单位', '数量', '单价', '金额', '税率/征收率', '税额']),
  ...row(180, ['*文具*合成便签', 'A', '包', '1', '10', '10', '13%', '1.30']),
  item('价税合计(小写)¥11.30', 20, 230),
];
it('半角括号、拆开的名称/冒号、偏移的日期和下一行税号按坐标读取', () => {
  const invoice = invoiceFromTextItems(fieldItems(), 'synthetic.pdf')!;
  expect(invoice.date).toBe('2026-06-08');
  expect(invoice.buyer).toEqual({ name: '合成大学', taxId: 'SYNTHBUYER00000001' });
  expect(invoice.seller).toEqual({ name: '合成电子公司', taxId: 'SYNTHSELLER0000001' });
});
it('负数且无数量单价的明细标为折扣，不报数量缺失、不算含税单价', () => {
  const items = pdfItems('110.74').filter(
    (i) => !i.str.startsWith('合计') && !i.str.startsWith('价税合计') && i.y !== 180,
  );
  items.push(
    ...row(175, ['', '', '', '', '', '-2.00', '13%', '-0.26']),
    item('合计', 20, 190),
    item('价税合计（小写）¥110.74', 20, 205),
  );
  const invoice = invoiceFromTextItems(items, 'synthetic.pdf')!;
  expect(invoice.lines).toHaveLength(2);
  expect(invoice.lines[1]).toMatchObject({
    discount: true,
    amount: -2,
    tax: -0.26,
    grossUnitPrice: null,
  });
  expect(invoice.warnings.some((w) => w.includes('缺少数量'))).toBe(false);
});
it('三行品名与不同基线的数字列合为一行，保留原数量金额税额', () => {
  const items = pdfItems('86.20').filter((i) => i.y < 140 || i.y >= 180);
  items.push(
    item('*配电设备*合成长名称', 20, 140),
    item('延续名称', 20, 145),
    item('末行品名', 20, 150),
    ...row(143, ['', 'SYNTH-M', '件', '', '76.28', '', '13%', '']),
    ...row(146, ['', '', '', '1', '', '76.28', '', '9.92']),
  );
  const invoice = invoiceFromTextItems(items, 'synthetic.pdf')!;
  expect(invoice.lines).toHaveLength(1);
  expect(invoice.lines[0]).toMatchObject({
    quantity: 1,
    unitPrice: 76.28,
    amount: 76.28,
    tax: 9.92,
  });
  expect(invoice.lines[0]!.name).toContain('末行品名');
});
it('旅客六列表头、折扣及出行人表；证件号码不进入 Invoice', () => {
  const items = pdfItems('20.60').filter((i) => i.y < 120);
  const six = (y: number, values: string[]) =>
    values.flatMap((s, n) => (s ? [item(s, [20, 210, 300, 390, 460, 550][n]!, y)] : []));
  items.push(
    item('旅客运输服务', 80, 50),
    ...six(120, ['项目名称', '单价', '数量', '金额', '税率/征收率', '税额']),
    ...six(140, ['*交通运输服务*客运服务费', '21', '1', '21', '3%', '0.63']),
    ...six(155, ['*交通运输服务*客运服务费', '', '', '-1', '3%', '-0.03']),
    item('合计', 20, 175),
  );
  const trip = (y: number, values: string[]) =>
    values.map((s, n) => item(s, [20, 100, 220, 300, 390, 470, 550][n]!, y));
  items.push(
    ...trip(190, [
      '出行人',
      '有效身份证件号',
      '出行日期',
      '出发地',
      '到达地',
      '等级',
      '交通工具类型',
    ]),
    ...trip(210, ['示例旅客', 'SYNTH-ID-NOT-STORED', '2026-06-01', '甲地', '乙地', '普通', '汽车']),
    item('价税合计（小写）¥20.60', 20, 240),
  );
  const invoice = invoiceFromTextItems(items, 'synthetic.pdf')!;
  expect(invoice.lines).toHaveLength(2);
  expect(invoice.lines[0]).toMatchObject({
    name: '*交通运输服务*客运服务费',
    quantity: 1,
    amount: 21,
    tax: 0.63,
  });
  expect(invoice.lines[1]!.discount).toBe(true);
  expect(invoice.trips).toEqual([
    {
      traveler: '示例旅客',
      date: '2026-06-01',
      departure: '甲地',
      destination: '乙地',
      grade: '普通',
      transportType: '汽车',
    },
  ]);
  expect(JSON.stringify(invoice)).not.toContain('SYNTH-ID-NOT-STORED');
});
it('出行表的合并文字项跨过证件列时也不持久化证件值', () => {
  const items = pdfItems().filter((i) => i.y < 180);
  const labels = [
    '出行人',
    '有效身份证件号',
    '出行日期',
    '出发地',
    '到达地',
    '等级',
    '交通工具类型',
  ];
  items.push(
    item('合计', 20, 180),
    ...labels.map((s, n) => item(s, [20, 100, 220, 300, 390, 470, 550][n]!, 200)),
    { ...item('合成旅客 SYNTH-PRIVATE-ID 2026-01-02 甲地 乙地 普通 汽车', 20, 220), width: 570 },
    item('价税合计（小写）¥113.00', 20, 260),
  );
  const invoice = invoiceFromTextItems(items, 'synthetic.pdf')!;
  expect(JSON.stringify(invoice)).not.toContain('SYNTH-PRIVATE-ID');
});
