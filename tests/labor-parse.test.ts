import { describe, expect, it } from 'vitest';
import { parseLaborText, parseLaborDates, chineseNumber } from '../src/core/labor/parse.js';
import { loadConfig } from '../src/core/rules/config.js';

const config = loadConfig();
export const syntheticStatement =
  '合成大学信息学院林示例副教授于2026年8月1日、9月5日就合成工艺提供线上专家咨询服务两次，每次咨询费1100元，共计2200元。现予以发放。特此说明。';
describe('劳务纯文本解析', () => {
  it('按单位姓名职称边界提取，跨行文字仍可识别，保留事由', () => {
    expect(parseLaborText(syntheticStatement.replace('线上', '线\n上'), config)).toMatchObject({
      organization: '合成大学信息学院',
      name: '林示例',
      title: '副教授',
      rank: 'senior',
      affiliation: 'external',
      type: 'consultation',
      mode: 'online',
      quantity: 2,
      unit: '次',
      unitPrice: 1100,
      total: 2200,
      purpose: '合成工艺',
      dates: [
        { date: '2026-08-01', precision: 'day' },
        { date: '2026-09-05', precision: 'day' },
      ],
    });
  });
  it('不从月份推测日，不从文件名猜姓名', () => {
    const fields = parseLaborText(
      syntheticStatement.replace('8月1日、9月5日', '8月、9月').replace('线上', ''),
      config,
    );
    expect(fields.dates).toEqual([
      { date: '2026-08', precision: 'month' },
      { date: '2026-09', precision: 'month' },
    ]);
    expect(fields.mode).toBeNull();
    expect(fields.unitPrice).toBe(1100);
    expect(fields.total).toBe(2200);
  });
  it('单价单位独立保留，负号不能被当作标签吞掉', () => {
    const f = parseLaborText(
      syntheticStatement
        .replace('线上', '线下')
        .replace('两次', '1天')
        .replace('每次咨询费1100', '每半天咨询费2000')
        .replace('2200', '2000'),
      config,
    );
    expect(f.unit).toBe('天');
    expect(f.priceUnit).toBe('半天');
    expect(
      parseLaborText(syntheticStatement.replace('咨询费1100', '咨询费-1100'), config).unitPrice,
    ).toBe(-1100);
  });
  it.each(['次', '天', '半天', '小时', '篇', '人·生', '套', '份'] as const)(
    '保留计费单位 %s',
    (unit) => {
      const f = parseLaborText(
        syntheticStatement.replace('两次', `两${unit}`).replace('每次', `每${unit}`),
        config,
      );
      expect(f.quantity).toBe(2);
      expect(f.unit).toBe(unit);
      expect(f.unitPrice).toBe(1100);
      expect(f.priceUnit).toBe(unit);
    },
  );
  it.each([
    ['一', 1],
    ['两', 2],
    ['二', 2],
    ['十', 10],
    ['十二', 12],
    ['二十', 20],
    ['三十五', 35],
    ['2.5', 2.5],
  ])('中文数 %s', (text, value) => {
    expect(chineseNumber(text)).toBe(value);
  });
  it('日期全写年份、沿用年份、日范围和无年份范围', () => {
    expect(parseLaborDates('2026年8月1日、2026年9月5日')).toEqual([
      { date: '2026-08-01', precision: 'day' },
      { date: '2026-09-05', precision: 'day' },
    ]);
    expect(parseLaborDates('2026年8月1日至3日').map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
    expect(parseLaborDates('8月1日至3日').map((d) => d.date)).toEqual([
      '--08-01',
      '--08-02',
      '--08-03',
    ]);
    expect(parseLaborDates('2026年2月30日')).toEqual([]);
  });
  it.each([
    ['院士', 'academic'],
    ['高级工程师', 'senior'],
    ['助理研究员', 'other'],
    ['讲师', 'other'],
  ])('职称 %s', (title, rank) => {
    const f = parseLaborText(
      syntheticStatement
        .replace('副教授', title)
        .replace('合成大学信息学院', '西安交通大学合成学院')
        .replace('线上', '现场'),
      config,
    );
    expect(f.rank).toBe(rank);
    expect(f.affiliation).toBe('internal');
    expect(f.mode).toBe('offline');
  });
  it.each([
    ['学术讲座', 'lecture'],
    ['项目评审', 'projectReview'],
    ['论文评审', 'paperReview'],
    ['论文答辩', 'defense'],
    ['考试监考', 'invigilation'],
    ['考试命题', 'examSetting'],
    ['考试阅卷', 'examGrading'],
    ['编辑审稿', 'editing'],
    ['其它劳务', 'other'],
  ])('类型 %s', (text, type) => {
    expect(parseLaborText(syntheticStatement.replace('专家咨询', text), config).type).toBe(type);
  });
});
