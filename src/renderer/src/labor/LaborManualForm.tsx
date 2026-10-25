import styles from '../styles/ui.module.css';
import formsStyles from '../styles/forms.module.css';
import settingsFieldsStyles from '../settings/fields.module.css';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun } from '../store/status.js';
import { LABOR_TYPES, type LaborEntry, type LaborManualEntry } from '../../../core/labor/types.js';
import { LABOR_UNITS } from '../../../core/labor/validation.js';
import { FieldOrigin, LaborSelect } from './LaborField.js';
import type { LaborDraft } from './useLaborDraft.js';

export function LaborManualForm({
  entry,
  dir,
  model,
}: {
  entry: LaborEntry;
  dir: string;
  model: LaborDraft;
}) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const { draft, setDraft, datesText, setDatesText, fields, set } = model;
  const source = (key: keyof LaborManualEntry) => (
    <FieldOrigin field={key} model={model} parsed={entry.parsed} />
  );
  const select = (key: keyof LaborManualEntry, label: string, options: Record<string, string>) => (
    <LaborSelect field={key} label={label} options={options} model={model} parsed={entry.parsed} />
  );
  return (
    <>
      <p className={styles.small + ' ' + styles.muted}>
        修改后保存再核对问题和标准；规范说明预览随字段实时更新。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            async () =>
              await apply(() => window.precheck.saveLabor(dir, entry.relativePath, draft)),
            '本笔劳务已保存并重新检查',
          );
        }}
      >
        <div className={formsStyles.formGrid}>
          {(['name', 'organization', 'title', 'purpose'] as const).map((key) => (
            <label key={key}>
              {{ name: '姓名', organization: '单位', title: '职称', purpose: '事由' }[key]}
              {source(key)}
              <input
                aria-label={
                  { name: '姓名', organization: '单位', title: '职称', purpose: '事由' }[key]
                }
                value={fields[key] ?? ''}
                onChange={(e) => set(key, e.target.value || null)}
              />
            </label>
          ))}
          {select('affiliation', '校内 / 校外', { internal: '校内', external: '校外' })}
          {select('type', '劳务类型', LABOR_TYPES)}
          {select('mode', '形式', { online: '线上', offline: '线下' })}
          <label>
            具体日期{source('dates')}
            <textarea
              aria-label="具体日期"
              rows={3}
              value={datesText}
              placeholder="每行一个 YYYY-MM-DD"
              onChange={(e) => {
                setDatesText(e.target.value);
                set(
                  'dates',
                  e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((date) => ({
                      date,
                      precision: /^(?:\d{4}|-)-\d{2}$/.test(date) ? 'month' : 'day',
                    })),
                );
              }}
            />
            <small>每行一个日期，例如 2026-08-01。月份不会自动补日。</small>
          </label>
          {(['quantity', 'unitPrice', 'total'] as const).map((key) => (
            <label key={key}>
              {{ quantity: '数量', unitPrice: '单价', total: '合计' }[key]}
              {source(key)}
              <input
                aria-label={{ quantity: '数量', unitPrice: '单价', total: '合计' }[key]}
                type="number"
                min={0}
                step="any"
                value={fields[key] ?? ''}
                onChange={(e) => set(key, e.target.value === '' ? null : e.target.valueAsNumber)}
              />
            </label>
          ))}
          {select('unit', '数量单位', Object.fromEntries(LABOR_UNITS.map((unit) => [unit, unit])))}
          {select(
            'priceUnit',
            '单价单位',
            Object.fromEntries(LABOR_UNITS.map((unit) => [unit, unit])),
          )}
          {select('studentLevel', '学生层次（论文评审 / 答辩）', {
            bachelor: '本科生',
            master: '硕士生',
            doctor: '博士生',
          })}
          {select('personnelRole', '监考人员类别', {
            teacher: '教师',
            administrative: '行政管理人员',
          })}
          {select('workTime', '监考时间', { work: '工作时间', holiday: '双休日、节假日' })}
          {(['nationalExpert', 'seniorStaff'] as const).map((key) => (
            <label key={key} className={settingsFieldsStyles.checkboxLabel}>
              <input
                type="checkbox"
                checked={draft[key] ?? false}
                onChange={(e) => set(key, e.target.checked)}
              />
              {key === 'nationalExpert' ? '全国知名专家' : '六级及以上职员'}
            </label>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.primary} type="submit">
            保存本笔并重新检查
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft({});
              setDatesText(entry.parsed.dates.map((d) => d.date).join('\n'));
            }}
          >
            恢复解析字段（保存后生效）
          </button>
        </div>
      </form>
    </>
  );
}
