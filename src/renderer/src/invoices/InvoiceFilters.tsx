import { CLAIM_STATE_LABELS } from '../../../core/domain/transitions.js';
import type { ClaimState } from '../../../core/domain/claim.js';
import type { InvoiceFilter } from './invoice-rows.js';
import styles from './invoices.module.css';

export function InvoiceFilters({
  filter,
  onChange,
  contents,
}: {
  filter: InvoiceFilter;
  onChange: (filter: InvoiceFilter) => void;
  contents: string[];
}) {
  return (
    <div className={styles.filters}>
      <label className={styles.search}>
        关键字
        <input
          type="search"
          aria-label="搜索发票"
          placeholder="发票号、销方或品名"
          value={filter.keyword}
          onChange={(event) => onChange({ ...filter, keyword: event.target.value })}
        />
      </label>
      <label>
        支出内容
        <select
          value={filter.expenseContent}
          onChange={(event) => onChange({ ...filter, expenseContent: event.target.value })}
        >
          <option value="">全部支出内容</option>
          {contents.map((content) => (
            <option key={content}>{content}</option>
          ))}
        </select>
      </label>
      <label>
        开始日期
        <input
          type="date"
          value={filter.start}
          onChange={(event) => onChange({ ...filter, start: event.target.value })}
        />
      </label>
      <label>
        结束日期
        <input
          type="date"
          value={filter.end}
          onChange={(event) => onChange({ ...filter, end: event.target.value })}
        />
      </label>
      <fieldset className={styles.states}>
        <legend>报销状态（不选表示全部）</legend>
        {(Object.entries(CLAIM_STATE_LABELS) as [ClaimState, string][]).map(([state, label]) => (
          <label key={state}>
            <input
              type="checkbox"
              checked={filter.states.includes(state)}
              onChange={(event) =>
                onChange({
                  ...filter,
                  states: event.target.checked
                    ? [...filter.states, state]
                    : filter.states.filter((value) => value !== state),
                })
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
