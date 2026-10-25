import styles from '../styles/ui.module.css';
import type { ManualTask } from '../../../shared/api.js';
import { Collapsible } from '../Collapsible.js';
import { ManualForm } from '../ManualForm.js';

export function ManualPanel({
  tasks,
  dir,
  exchangeRateType,
}: {
  tasks: ManualTask[];
  dir: string;
  exchangeRateType?: string;
}) {
  const pending = tasks.filter((task) => task.pending).length;
  return (
    <Collapsible
      scope={dir}
      disclosureKey="manual"
      title="手填与汇率"
      summary={`待手填 ${pending} 项`}
      attention={pending > 0}
      testId="section-manual"
    >
      <p className={styles.muted}>
        保存后重新检查。每张海外收据单独填写；未读取到收据的 AI 组可按实际支付记录补录。
      </p>
      {tasks.length ? (
        tasks.map((task) => (
          <ManualForm
            key={task.key + JSON.stringify(task.entry)}
            task={{
              ...task,
              entry: { exchangeRateType: exchangeRateType, ...task.entry },
            }}
            dir={dir}
          />
        ))
      ) : (
        <p className={styles.panel + ' ' + styles.muted}>当前没有需要补录的海外收据或 AI 组。</p>
      )}
    </Collapsible>
  );
}
