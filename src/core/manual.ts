import { readFile, lstat } from 'node:fs/promises';
import { isAbsolute, join, normalize, sep, win32 } from 'node:path';
import type { Batch, Invoice, ManualData, ManualEntry } from './types.js';
import { isAttachmentType } from './attachments.js';
import { validateLaborManual } from './labor/validation.js';

export function findManualEntry(batch: Batch, invoice: Invoice): ManualEntry | undefined {
  return batch.manual.entries.find(
    (e, n) =>
      e.number === invoice.number ||
      (e.sourceFile && invoice.sources.some((s) => s.relativePath === e.sourceFile)) ||
      (!e.sourceFile && !e.number && invoice.number === `manual:${e.group}:${n + 1}`),
  );
}

function relativeFile(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    isAbsolute(value) ||
    win32.isAbsolute(value) ||
    value.split('/').includes('..') ||
    value.includes('\\') ||
    value.includes('\0') ||
    normalize(value) === '.'
  )
    throw new Error('文件路径必须为批次内相对路径（用 / 分隔）');
  return normalize(value).split(sep).join('/');
}

export function validateManual(value: unknown): ManualData {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('手填数据必须为对象');
  const data = structuredClone(value) as Record<string, unknown>;
  if (data.version === undefined) data.version = 1;
  if (data.entries === undefined) data.entries = [];
  if (data.version !== 1 || !Array.isArray(data.entries))
    throw new Error('手填数据需要 version: 1 和 entries 数组');
  if (data.labor !== undefined) data.labor = validateLaborManual(data.labor);
  if (data.ignored !== undefined) {
    if (!Array.isArray(data.ignored)) throw new Error('ignored 必须为批次内相对路径数组');
    const ignored = data.ignored.map(relativeFile);
    if (new Set(ignored).size !== ignored.length) throw new Error('ignored 包含重复的规范路径');
    data.ignored = ignored;
  }
  if (data.attachments !== undefined) {
    if (
      !data.attachments ||
      typeof data.attachments !== 'object' ||
      Array.isArray(data.attachments)
    )
      throw new Error('attachments 必须为路径到附件类型的映射');
    const attachments: NonNullable<ManualData['attachments']> = {};
    for (const [path, type] of Object.entries(data.attachments)) {
      const file = relativeFile(path);
      if (!isAttachmentType(type)) throw new Error(`附件类型不合法：${String(type)}`);
      if (Object.hasOwn(attachments, file)) throw new Error('附件覆盖包含重复的规范路径');
      attachments[file] = type;
    }
    data.attachments = attachments;
  }
  if (data.laborAttachments !== undefined) {
    if (
      !data.laborAttachments ||
      typeof data.laborAttachments !== 'object' ||
      Array.isArray(data.laborAttachments)
    )
      throw new Error('laborAttachments 必须为路径到会议附件类型的映射');
    const overrides: NonNullable<ManualData['laborAttachments']> = {};
    for (const [path, type] of Object.entries(data.laborAttachments)) {
      const file = relativeFile(path);
      if (!['settlement', 'notice', 'attendance'].includes(String(type)))
        throw new Error('劳务附件类型不合法');
      if (Object.hasOwn(overrides, file)) throw new Error('劳务附件覆盖包含重复的规范路径');
      overrides[file] = type as NonNullable<ManualData['laborAttachments']>[string];
    }
    data.laborAttachments = overrides;
  }
  const keys = new Set<string>();
  for (const raw of data.entries) {
    if (!raw || typeof raw !== 'object') throw new Error('手填条目必须为对象');
    const v = raw as ManualEntry;
    if (
      (!v.sourceFile && !v.group) ||
      typeof v.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(v.currency) ||
      !Number.isFinite(v.amount) ||
      v.amount < 0
    )
      throw new Error('手填条目需要来源文件或组、三位币种及非负金额');
    if (
      typeof v.paymentDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(v.paymentDate) ||
      Number.isNaN(Date.parse(v.paymentDate)) ||
      new Date(v.paymentDate).toISOString().slice(0, 10) !== v.paymentDate
    )
      throw new Error('支付日期必须为有效 YYYY-MM-DD');
    for (const key of ['exchangeRate', 'rateBase'] as const)
      if (v[key] !== undefined && (!Number.isFinite(v[key]) || v[key]! <= 0))
        throw new Error(`${key} 必须为正数`);
    if (v.sourceFile !== undefined) v.sourceFile = relativeFile(v.sourceFile);
    if (v.group && (typeof v.group !== 'string' || /[\\/]/.test(v.group) || v.group === '..'))
      throw new Error('group 必须为一级目录名或根目录');
    if (v.number !== undefined && (typeof v.number !== 'string' || !v.number.trim()))
      throw new Error('手填号码不合法');
    if (v.seller !== undefined && typeof v.seller !== 'string') throw new Error('手填商家不合法');
    if (
      v.exchangeRateType !== undefined &&
      (typeof v.exchangeRateType !== 'string' || !v.exchangeRateType.trim())
    )
      throw new Error('汇率类型不合法');
    const key = v.sourceFile ?? `group:${v.group}:${v.number ?? ''}`;
    if (keys.has(key)) throw new Error('手填数据中来源重复，请使用 number 区分同组多笔收据');
    keys.add(key);
  }
  return data as unknown as ManualData;
}
export async function readManual(dir: string): Promise<ManualData> {
  const path = join(dir, '_预检', 'manual.json');
  try {
    if ((await lstat(join(dir, '_预检'))).isSymbolicLink() || (await lstat(path)).isSymbolicLink())
      throw new Error('手填文件不允许使用符号链接');
    return validateManual(JSON.parse(await readFile(path, 'utf8')) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: [] };
    throw error;
  }
}
