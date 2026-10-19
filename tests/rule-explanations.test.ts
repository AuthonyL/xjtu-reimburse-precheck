import { expect, it } from 'vitest';
import {
  RULE_CATALOG,
  RETIRED_RULE_NOTES,
  criteria,
  ruleMeaning,
  RULE_NUMBERING,
} from '../src/core/rules/catalog.js';
import { config } from './helpers.js';
const originals: Record<string, string> = {
  R1: '金额超过500要入库单',
  R2: '单日单公司超过 1k 要补支付记录',
  R3: 'AI 是资料费/需要提供付款凭证',
  R4: '亚克力需要提供店铺',
  R5: 'PCB 外包属于委托业务费不是其他',
  R6: 'PCB 外包设计需要提供设计清单',
  R7: '发票超5k要验真',
  R9: '除外包外其他公转器件要增加入库单',
  R10: '美元汇率圈出来选择哪个汇率/中国银行官网提取汇率信息',
  R11: '同一家公司当天开票500以上需要入库单，无论是否区分发票，切换500为两张都需要开具入库单',
  R12: '高值材料审批表在入库完成之后，如果金额超过 1w 附带可以下载',
  R13: '材料单价超过 1k 需要填写高值材料审批或者资产建账，高值材料属于使用期限不超过1年，资产建帐为仪器等类',
};
it('每条规则都有原文，README 编号逐一对应；R14 只读说明不进入检查目录', () => {
  for (const rule of RULE_CATALOG) expect(rule.sourceText.trim()).not.toBe('');
  expect(
    Object.fromEntries(
      RULE_CATALOG.filter((r) => r.source.kind === 'readme').map((r) => [r.id, r.sourceText]),
    ),
  ).toEqual(originals);
  expect(RETIRED_RULE_NOTES).toContainEqual(
    expect.objectContaining({
      id: 'R14',
      sourceText: '不要写文具办公用品类的',
      note: '已由 F2 代替',
    }),
  );
  expect(RULE_CATALOG.some((r) => String(r.id) === 'R14')).toBe(false);
});
it('财务7原文用于所有劳务细分，L3列出标准出处，购买方关联财务1', () => {
  const original =
    '劳务费、咨询费等发放写清职称、具体时间、线上（哪几次）或线下（哪几天），讲座、评审、答辩、监考归为其他劳务。检查是否超过发放标准。';
  for (const rule of RULE_CATALOG.filter((r) => /^L\d/.test(r.id)))
    expect(rule.sourceText).toContain(original);
  expect(RULE_CATALOG.find((r) => r.id === 'L3')!.sourceText).toContain('财务手册第 60–61 页');
  expect(RULE_CATALOG.find((r) => r.id === 'buyer')!.sourceText).toContain(
    '抬头是否为西安交通大学',
  );
  expect(ruleMeaning('R11')).toBe('R11 = README 第 11 条');
  expect(ruleMeaning('L3')).toContain('财务补充第 7 条');
  expect(RULE_NUMBERING).toHaveLength(5);
});
it('阈值、方向、豁免税目和级别都用当前配置；关键字前8个摘要及完整口径', () => {
  const c = config();
  c.thresholds.inventory = { value: 765, operator: '>' };
  c.exemptTaxCategories = ['合成豁免'];
  expect(criteria('R11', c)).toContain('> 765 元');
  expect(criteria('R11', c)).toContain('整个批次');
  expect(criteria('R11', c)).toContain('合成豁免');
  c.horizontalOnlyKeywords = Array.from({ length: 10 }, (_, i) => '词' + i);
  c.ruleOptions.F2.severity = 'error';
  const text = criteria('F2', c);
  expect(text).toContain('税目、品名或文件名');
  expect(text).toContain('词7');
  expect(text).not.toContain('词8');
  expect(text).toContain('等 10 个');
  expect(text).toContain('错误');
  expect(text).toContain('不区分批次经费类型');
  expect(criteria('F2', c, { fullKeywords: true })).toContain('词9');
  c.thresholds.inventory = { value: 500, operator: '>=' };
  expect(criteria('R1', c)).toContain('≥ 500 元');
  for (const rule of RULE_CATALOG) expect(criteria(rule, c).trim().length).toBeGreaterThan(10);
});

it('劳务标准的不同情形级别随规则覆盖变化，标准金额也来自当前表', () => {
  const c = config();
  c.ruleOptions.L3.severity = 'warning';
  c.laborStandards.consultation[0]!.max = 4567;
  const text = criteria('L3', c, { fullKeywords: true });
  expect(text).toContain('两套都超为警告');
  expect(text).toContain('低于适用下限为警告');
  expect(text).toContain('4567');
});

it('R6 只说明组名命中；单靠服务税目的要求属于 R5', () => {
  const c = config();
  c.groupKeywords.outsourced = ['合成委托组'];
  c.designKeywords = ['合成服务税目'];
  const text = criteria('R6', c);
  expect(text).toContain('合成委托组');
  expect(text).not.toContain('合成服务税目');
  expect(text).toContain('R5');
});

it('当前科目名称用于AI和委托口径', () => {
  const c = config();
  c.expense.ai = '合成订阅科目';
  c.expense.outsourced = '合成委托科目';
  expect(criteria('R3', c)).toContain('合成订阅科目');
  expect(criteria('R3', c)).not.toContain('→ 资料费');
  expect(criteria('R5', c)).toContain('合成委托科目');
});
it('咨询标准税基随当前表格改变', () => {
  const c = config();
  const before = criteria('L3', c, { fullKeywords: true });
  c.laborStandards.consultation.forEach((row) => {
    row.taxBasis = 'before';
  });
  const after = criteria('L3', c, { fullKeywords: true });
  expect(after).not.toBe(before);
  expect(after).not.toContain('校内其他经费按税后');
  expect(after).toContain('（税前）');
});

it('判定口径不重复当前级别，级别由规则详情独立展示', () => {
  for (const rule of RULE_CATALOG) expect(criteria(rule, config())).not.toContain('当前级别');
});
