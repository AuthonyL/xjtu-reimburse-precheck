import type { Batch } from './types.js';
export function deriveBatchDate(
  name: string,
  dates: string[],
  modifiedAt: number,
): { batchDate: string; batchDateSource: 'name' | 'invoice' | 'modified' } {
  const fromName = name.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (fromName) {
    const date = `${fromName[1]}-${fromName[2]}-${fromName[3]}`;
    if (
      Number.isFinite(new Date(date).getTime()) &&
      new Date(date).toISOString().slice(0, 10) === date
    )
      return { batchDate: date, batchDateSource: 'name' };
  }
  const latest = dates
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .at(-1);
  if (latest) return { batchDate: latest, batchDateSource: 'invoice' };
  const date = new Date(modifiedAt);
  return {
    batchDate: [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-'),
    batchDateSource: 'modified',
  };
}
export function compareBatches(a: Batch, b: Batch): number {
  const date = (batch: Batch) =>
    batch.batchDate ??
    deriveBatchDate(
      batch.id,
      batch.invoices.map((i) => i.date),
      0,
    ).batchDate;
  return date(b).localeCompare(date(a)) || a.id.localeCompare(b.id, 'zh-CN');
}
