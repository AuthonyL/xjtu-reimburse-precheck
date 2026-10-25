import styles from '../styles/ui.module.css';
import { Money } from '../ui.js';
import type { GroupReport, ManualEntry } from '../../../core/types.js';
import { INVOICE_TYPE_LABELS } from '../../../core/rules/catalog.js';
import { Collapsible } from '../Collapsible.js';
import { FileLink, money } from '../ui.js';

export function InvoiceTable({
  groups,
  entries,
  dir,
  totalCny,
}: {
  groups: GroupReport[];
  entries: ManualEntry[];
  dir: string;
  totalCny: number;
}) {
  const invoiceRows = groups.flatMap((g) => g.invoices.map((i) => ({ g, i })));
  return (
    <Collapsible
      scope={dir}
      disclosureKey="invoices"
      title="发票明细"
      summary={`${invoiceRows.length} 张 · ¥ ${money(totalCny)}`}
      testId="section-invoices"
    >
      <div className={styles.tableScroll + ' ' + styles.panel}>
        <table aria-label="发票明细">
          <thead>
            <tr>
              {[
                '序号',
                '号码',
                '票种',
                '开票 / 支付日期',
                '销方',
                '价税合计',
                '币种',
                '支出内容',
                '所在组',
                '来源文件',
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoiceRows.map(({ g, i }, index) => (
              <tr key={g.group.id + i.invoice.number}>
                <td>{index + 1}</td>
                <td className={styles.number}>{i.invoice.number}</td>
                <td>{INVOICE_TYPE_LABELS[i.invoice.invoiceType]}</td>
                <td>{i.invoice.date || '待填'}</td>
                <td>{i.invoice.seller.name}</td>
                <td className={styles.numeric}>
                  <Money value={i.invoice.total} />
                </td>
                <td>{i.invoice.currency}</td>
                <td>{i.expenseContent}</td>
                <td>{g.group.name}</td>
                <td>
                  {i.invoice.sources
                    .filter(
                      (s) =>
                        s.format !== 'manual' ||
                        entries.some((e) => e.sourceFile === s.relativePath),
                    )
                    .map((s) => (
                      <FileLink key={s.path} file={s.path} />
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}
