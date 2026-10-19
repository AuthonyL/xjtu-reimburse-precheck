import { join } from 'node:path';
import { rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ManualEntry } from '../core/types.js';
import { validateManual } from '../core/manual.js';
import type { BocSelection } from '../shared/api.js';
import { rateFromSelection } from './boc-selection.js';
import { batchFile, outputDirectory } from './paths.js';
import { readJson, writeJson, SerialQueue } from './json-store.js';
import { saveManualEntry } from './manual-store.js';

interface RateCapture {
  file: string;
  group: string;
  date: string;
  currency: string;
  rate: number;
  rateType: string;
}
export async function readRateCaptures(batch: string): Promise<RateCapture[]> {
  const raw = await readJson(await batchFile(batch, '_预检/rates.json', true), []);
  if (
    !Array.isArray(raw) ||
    raw.some(
      (r: RateCapture) =>
        !r ||
        typeof r.group !== 'string' ||
        !r.group ||
        /[\\/]/.test(r.group) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
        !/^[A-Z]{3}$/.test(r.currency) ||
        r.file !== `_预检/汇率-${r.date}-${r.currency}.png` ||
        !Number.isFinite(r.rate) ||
        r.rate <= 0 ||
        typeof r.rateType !== 'string',
    )
  )
    throw new Error('汇率截图索引格式不正确');
  return raw as RateCapture[];
}
const queue = new SerialQueue();
export function saveRateCapture(
  batch: string,
  raw: ManualEntry,
  selection: BocSelection,
  png: Buffer,
) {
  return queue.run(async () => {
    const entry = validateManual({ entries: [raw] }).entries[0]!;
    if (!entry.group || !entry.exchangeRateType) throw new Error('汇率截图需要组和汇率类型');
    const rate = rateFromSelection(selection, entry);
    const rows = await readRateCaptures(batch);
    const relative = `_预检/汇率-${entry.paymentDate}-${entry.currency}.png`;
    if (
      rows.some(
        (r) =>
          r.file === relative &&
          r.group !== entry.group &&
          (Math.abs(r.rate - rate) > 1e-12 || r.rateType !== entry.exchangeRateType),
      )
    )
      throw new Error('此日期和币种的截图已被其他组使用，不能改成另一牌价；请保留原截图并手填核对');
    const dir = await outputDirectory(batch);
    const file = await batchFile(batch, relative, true);
    const temporary = join(dir, randomUUID() + '.tmp');
    try {
      await writeFile(temporary, png, { flag: 'wx' });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
    await saveManualEntry(batch, { ...entry, exchangeRate: rate, rateBase: 1 });
    const row: RateCapture = {
      file: relative,
      group: entry.group,
      date: entry.paymentDate,
      currency: entry.currency,
      rate,
      rateType: entry.exchangeRateType,
    };
    await writeJson(join(dir, 'rates.json'), [
      ...rows.filter((r) => !(r.file === relative && r.group === entry.group)),
      row,
    ]);
    return file;
  });
}
