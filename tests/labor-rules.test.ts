import { describe, expect, it } from 'vitest';
import { checkLabor } from '../src/core/labor/engine.js';
import { loadConfig } from '../src/core/rules/config.js';
import { laborScan } from './labor-fixtures.js';
import { parseLaborText } from '../src/core/labor/parse.js';
import type { LaborFields } from '../src/core/labor/types.js';

const config = loadConfig();
const entry = (fields: Partial<LaborFields> = {}) =>
  checkLabor(laborScan(fields), config).entries[0]!;
describe('劳务规则 L1–L5', () => {
  it('数量按天但单价按半天，L2报错且L3使用半天上限，不能误判通过', () => {
    const scan = laborScan();
    const text =
      '合成大学林示例副教授于2026年8月1日就合成工艺提供线下专家咨询服务1天，每半天咨询费2000元，共计2000元。';
    scan.statements[0]!.text = text;
    scan.statements[0]!.parsed = parseLaborText(text, config);
    const report = checkLabor(scan, config);
    const r = report.entries[0]!;
    expect(report.passed).toBe(0);
    expect(r.findings.some((f) => f.ruleId === 'L2' && f.message.includes('单位不一致'))).toBe(
      true,
    );
    expect(r.standards[0]?.max).toBe(1600);
    expect(r.findings.some((f) => f.ruleId === 'L3' && f.message.includes('仅横向'))).toBe(true);
  });
  it('负单价不能通过金额检查', () => {
    const scan = laborScan({ unitPrice: -1100, total: 2200 });
    const r = checkLabor(scan, config);
    expect(r.passed).toBe(0);
    expect(r.entries[0]!.findings.some((f) => f.ruleId === 'L2' && f.severity === 'error')).toBe(
      true,
    );
  });
  it('完整线上咨询不产生 L1–L4 问题，列出独立的两套适用标准', () => {
    const result = entry();
    expect(result.findings.filter((f) => ['L1', 'L2', 'L3', 'L4'].includes(f.ruleId))).toEqual([]);
    expect(result.standards.map((s) => s.label)).toEqual([
      '其他经费 · 校外 · 高级职称 · 通讯 300–1300 元/人·次（税前）',
      '横向 · 高级职称 · 通讯 200–2250 元/人·次（税前）',
    ]);
  });
  it.each(['name', 'organization', 'title', 'mode', 'quantity', 'unitPrice', 'total'] as const)(
    'L1 缺 %s 独立报错并提供 action',
    (key) => {
      const result = entry({ [key]: null });
      const f = result.findings.filter((f) => f.ruleId === 'L1' && f.severity === 'error');
      expect(f.length).toBeGreaterThan(0);
      expect(f.every((f) => f.action.length > 0)).toBe(true);
    },
  );
  it('缺日期精度和形式恰好两条 error，保留职称金额', () => {
    const result = entry({
      dates: [
        { date: '2026-08', precision: 'month' },
        { date: '2026-09', precision: 'month' },
      ],
      mode: null,
    });
    expect(result.findings.filter((f) => f.severity === 'error').map((f) => f.message)).toEqual([
      '日期没写到具体哪一天',
      '没写线上还是线下',
    ]);
  });
  it('线上次数、线下天数均按日期核对；半天不强求两个日期', () => {
    expect(
      entry({ quantity: 3, total: 3300 }).findings.some((f) =>
        f.message.includes('线上要写清是哪几次'),
      ),
    ).toBe(true);
    expect(
      entry({ mode: 'offline', unit: '天', quantity: 3, total: 3300 }).findings.some((f) =>
        f.message.includes('线下要写清是哪几天'),
      ),
    ).toBe(true);
    expect(
      entry({
        mode: 'offline',
        unit: '半天',
        quantity: 1,
        total: 1100,
        dates: [{ date: '2026-08-01', precision: 'day' }],
      }).findings.filter((f) => f.ruleId === 'L1'),
    ).toEqual([]);
  });
  it.each([
    [1300, null],
    [1300.01, 'warning'],
    [2250, 'warning'],
    [2250.01, 'error'],
    [199.99, 'info'],
    [200, 'info'],
    [300, null],
  ] as const)('线上咨询单价 %s 的边界', (price, severity) => {
    const findings = entry({ unitPrice: price, total: price * 2 }).findings.filter(
      (f) => f.ruleId === 'L3',
    );
    expect(findings[0]?.severity ?? null).toBe(severity);
    if (severity === 'warning') expect(findings[0]?.message).toContain('此金额仅横向经费可发');
  });
  it.each([
    ['半天', 1, 1600],
    ['天', 2, 2800],
    ['天', 3, 1300],
  ] as const)('线下 %s %s 使用正确标准', (unit, quantity, limit) => {
    const result = entry({
      mode: 'offline',
      unit,
      quantity,
      unitPrice: limit,
      total: quantity * limit,
    });
    expect(result.standards[0]?.max).toBe(limit);
    expect(result.standards[0]?.position).toBe('within');
  });
  it('院士横向按高级；校内附税后提示；手填全国知名专家/六级职员覆盖职称分级', () => {
    const report = checkLabor(
      laborScan({
        affiliation: 'internal',
        title: '院士',
        rank: 'academic',
        unitPrice: 1800,
        total: 3600,
      }),
      config,
    );
    expect(report.entries[0]!.standards.map((s) => s.max)).toEqual([1800, 2250]);
    expect(
      report.entries[0]!.findings.some((f) => f.severity === 'info' && f.message.includes('税后')),
    ).toBe(true);
    expect(
      checkLabor(laborScan({}, { nationalExpert: true }), config).entries[0]!.standards[0]!.max,
    ).toBe(2050);
    expect(
      checkLabor(laborScan({ title: '职员', rank: 'other' }, { seniorStaff: true }), config)
        .entries[0]!.standards[0]!.max,
    ).toBe(1300);
  });
  it('缺单价仍列出校内税后口径，不用未知计费条件宣告通过', () => {
    const r = entry({ affiliation: 'internal', unitPrice: null });
    expect(
      r.findings.some(
        (f) => f.ruleId === 'L3' && f.severity === 'info' && f.message.includes('税后'),
      ),
    ).toBe(true);
    expect(checkLabor(laborScan({ type: null }), config).passed).toBe(0);
  });
  it.each([
    ['projectReview', '半天', 2000, '院士', undefined],
    ['projectReview', '半天', 1000, '副教授', undefined],
    ['projectReview', '半天', 500, '讲师', undefined],
    ['lecture', '小时', 1500, '院士', undefined],
    ['lecture', '小时', 1000, '副教授', undefined],
    ['lecture', '小时', 500, '讲师', undefined],
    ['paperReview', '篇', 100, '讲师', 'bachelor'],
    ['paperReview', '篇', 300, '讲师', 'master'],
    ['paperReview', '篇', 800, '讲师', 'doctor'],
    ['defense', '人·生', 100, '讲师', 'bachelor'],
    ['defense', '人·生', 200, '讲师', 'master'],
    ['defense', '人·生', 500, '讲师', 'doctor'],
    ['examSetting', '套', 1500, '讲师', undefined],
    ['examGrading', '份', 10, '讲师', undefined],
    ['editing', '篇', 500, '讲师', undefined],
    ['other', '天', 300, '讲师', undefined],
    ['other', '小时', 40, '讲师', undefined],
  ] as const)('%s %s 的上限 %s 含等号，超一分则 error', (type, unit, max, title, studentLevel) => {
    const run = (price: number) =>
      checkLabor(
        laborScan(
          { type, unit, title, unitPrice: price, total: price * 2 },
          studentLevel ? { studentLevel } : {},
        ),
        config,
      ).entries[0]!;
    expect(run(max).standards[0]?.max).toBe(max);
    expect(run(max).findings.filter((f) => f.ruleId === 'L3' && f.severity === 'error')).toEqual(
      [],
    );
    expect(run(max + 0.01).findings.some((f) => f.ruleId === 'L3' && f.severity === 'error')).toBe(
      true,
    );
  });
  it('L2 数量乘单价和发放表金额分别检查，容差一分', () => {
    expect(entry({ total: 2200.01 }).findings.filter((f) => f.ruleId === 'L2')).toEqual([]);
    expect(entry({ total: 2200.02 }).findings.some((f) => f.ruleId === 'L2')).toBe(true);
    const f = checkLabor(laborScan({}, { tableAmount: 2201 }), config).entries[0]!.findings;
    expect(f.some((f) => f.ruleId === 'L2' && f.message.includes('发放表金额'))).toBe(true);
  });
  it('其他劳务按单位与层次查表，超标 error，缺层次不猜', () => {
    const r = checkLabor(
      laborScan(
        { type: 'paperReview', unit: '篇', unitPrice: 301, total: 602 },
        { studentLevel: 'master' },
      ),
      config,
    ).entries[0]!;
    expect(r.standards[0]!.max).toBe(300);
    expect(r.findings.some((f) => f.ruleId === 'L3' && f.severity === 'error')).toBe(true);
    expect(
      entry({ type: 'paperReview', unit: '篇' }).findings.some(
        (f) => f.ruleId === 'L3' && f.message.includes('学生层次'),
      ),
    ).toBe(true);
    expect(entry({ type: 'examGrading', unit: '小时' }).standards).toEqual([]);
  });
  it('监考行政人员区分工作/节假日，教师保留非任课课程提示', () => {
    for (const [workTime, max] of [
      ['work', 50],
      ['holiday', 100],
    ] as const) {
      const r = checkLabor(
        laborScan(
          { type: 'invigilation', unit: '小时', unitPrice: max, total: 2 * max },
          { personnelRole: 'administrative', workTime },
        ),
        config,
      ).entries[0]!;
      expect(r.standards[0]!.max).toBe(max);
    }
    expect(
      checkLabor(
        laborScan({ type: 'invigilation', unit: '小时' }, { personnelRole: 'teacher' }),
        config,
      ).entries[0]!.findings.some((f) => f.message.includes('非任课课程')),
    ).toBe(true);
  });
  it('监考人员识别词可配置，缺工作日条件不套错标准', () => {
    const c = loadConfig({ labor: { personnelKeywords: { administrative: ['办事员'] } } });
    const result = checkLabor(
      laborScan({ title: '办事员', type: 'invigilation', unit: '小时' }, { workTime: 'work' }),
      c,
    ).entries[0]!;
    expect(result.standards[0]?.max).toBe(50);
  });
  it('L4 讲座却写咨询费要改归类；咨询无此提示', () => {
    expect(entry({ type: 'lecture', unit: '小时' }).findings.some((f) => f.ruleId === 'L4')).toBe(
      true,
    );
    expect(entry().findings.some((f) => f.ruleId === 'L4')).toBe(false);
  });
  it('PDF折行不漏掉咨询费和会议关键字', () => {
    const scan = laborScan({ type: 'lecture', mode: 'offline', unit: '小时' });
    scan.statements[0]!.text = scan.statements[0]!.text.replace('咨询费', '咨\n询费') + '会\n议';
    const e = checkLabor(scan, config).entries[0]!;
    expect(e.findings.some((f) => f.ruleId === 'L4')).toBe(true);
    expect(e.requirements).toHaveLength(3);
  });
  it('L5 仅线下会议要三份附件，识别同目录文件', () => {
    const scan = laborScan({ mode: 'offline', unit: '天' });
    scan.statements[0]!.text += '会议';
    let e = checkLabor(scan, config).entries[0]!;
    expect(e.requirements).toHaveLength(3);
    scan.attachments = ['会议决算表.pdf', '会议通知.pdf', '参会人员签到表.jpg'].map(
      (relativePath) => ({
        relativePath,
        path: scan.dir + '/' + relativePath,
        label: '附件',
        noText: false,
      }),
    );
    e = checkLabor(scan, config).entries[0]!;
    expect(e.requirements.every((r) => r.status === 'found')).toBe(true);
    expect(e.findings.filter((f) => f.ruleId === 'L5')).toEqual([]);
    expect(entry().requirements).toEqual([]);
  });
  it('手填覆盖后重分级，规则开关和级别生效', () => {
    const c = loadConfig({ ruleOptions: { L2: { enabled: false }, L1: { severity: 'warning' } } });
    const r = checkLabor(
      laborScan({ name: null, total: 1 }, { title: '院士', mode: 'offline', unit: '半天' }),
      c,
    ).entries[0]!;
    expect(r.fields.rank).toBe('academic');
    expect(r.findings.some((f) => f.ruleId === 'L2')).toBe(false);
    expect(r.findings.find((f) => f.ruleId === 'L1')?.severity).toBe('warning');
  });
});
it('会议附件手动覆盖优先于文件名，且不能跨说明所在子目录匹配', () => {
  const scan = laborScan({ mode: 'offline' });
  scan.statements[0]!.text += '会议';
  scan.attachments = [
    {
      path: '/synthetic/劳务费/会议通知.png',
      relativePath: '会议通知.png',
      label: '附件',
      noText: false,
    },
    {
      path: '/synthetic/劳务费/其他/签到.png',
      relativePath: '其他/签到.png',
      label: '附件',
      noText: false,
    },
  ];
  scan.manual.laborAttachments = { '会议通知.png': 'settlement', '其他/签到.png': 'attendance' };
  const requirements = checkLabor(scan, config).entries[0]!.requirements;
  expect(requirements.find((r) => r.type === 'settlement')!.status).toBe('found');
  expect(requirements.find((r) => r.type === 'notice')!.status).toBe('missing');
  expect(requirements.find((r) => r.type === 'attendance')!.status).toBe('missing');
});
