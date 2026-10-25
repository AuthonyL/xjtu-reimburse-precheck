import styles from './styles/forms.module.css';
import uiStyles from './styles/ui.module.css';
import { Pill } from './ui.js';
import { useWorkspaceStore } from './store/workspace.js';
import { useRun } from './store/status.js';
import { useId, useState } from 'react';
import type { ManualEntry } from '../../core/types.js';
import type { ManualTask } from '../../shared/api.js';

export function ManualForm({ task, dir }: { task: ManualTask; dir: string }) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const id = useId();
  const [amount, setAmount] = useState(task.entry.amount?.toString() ?? '');
  const [currency, setCurrency] = useState(task.entry.currency ?? 'USD');
  const [date, setDate] = useState(task.entry.paymentDate ?? '');
  const [rate, setRate] = useState(
    task.entry.exchangeRate === undefined
      ? ''
      : String(task.entry.exchangeRate / (task.entry.rateBase ?? 1)),
  );
  const [rateType, setRateType] = useState(task.entry.exchangeRateType ?? '现汇买入价');
  const entry = (): ManualEntry => ({
    ...task.entry,
    group: task.group,
    currency,
    amount: Number(amount),
    paymentDate: date,
    exchangeRate: rate ? Number(rate) : undefined,
    rateBase: 1,
    exchangeRateType: rateType,
  });
  return (
    <form
      className={styles.manualForm}
      data-testid="manual-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => apply(() => window.precheck.saveManual(dir, entry())),
          '手填记录已保存并重新检查',
        );
      }}
    >
      <div className={uiStyles.cardHeading + ' ' + styles.formHeading}>
        <strong>
          {task.group} · {task.label}
        </strong>
        <Pill tone={task.pending ? 'warning' : 'found'}>
          {task.pending ? '? 待手填' : '✓ 已记录，可修改'}
        </Pill>
      </div>
      <div className={styles.formGrid}>
        <label htmlFor={id + 'amount'}>
          金额
          <input
            id={id + 'amount'}
            type="number"
            min="0"
            step="any"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label htmlFor={id + 'currency'}>
          币种
          <input
            id={id + 'currency'}
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </label>
        <label htmlFor={id + 'date'}>
          支付日期
          <input
            id={id + 'date'}
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label htmlFor={id + 'rate'}>
          汇率（每1外币兑人民币）
          <input
            id={id + 'rate'}
            type="number"
            min="0.00000001"
            step="any"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="暂缺可留空"
          />
        </label>
        <label htmlFor={id + 'type'}>
          汇率类型
          <input
            id={id + 'type'}
            required
            value={rateType}
            onChange={(e) => setRateType(e.target.value)}
          />
        </label>
      </div>
      <div className={uiStyles.actions}>
        <button className={uiStyles.primary} type="submit">
          保存手填
        </button>
        <button
          type="button"
          onClick={(e) => {
            if (e.currentTarget.form?.reportValidity())
              void run(() => window.precheck.openBoc({ batchDir: dir, entry: entry() }));
          }}
        >
          打开中行历史牌价
        </button>
      </div>
      <p className={uiStyles.muted + ' ' + uiStyles.small + ' ' + styles.formHelp}>
        按实际支付日填写。中行牌价每 100 外币报价，窗口取值会自动除以 100；手填此处请用每 1
        外币汇率。
      </p>
    </form>
  );
}
