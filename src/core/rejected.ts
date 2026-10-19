import { lstat, readFile } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import type { Batch, RejectedInfo, RejectedReasons } from './types.js';
import type { RuleConfig } from './rules/config.js';
import { checkBatch } from './rules/engine.js';
import { ruleDefinition } from './rules/catalog.js';

export const REASONS_RELATIVE_PATH = '_预检/reasons.json';
export function validateRejectedReasons(value: unknown): RejectedReasons {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('拒票原因必须为按发票号索引的对象');
  const out: RejectedReasons = Object.create(null) as RejectedReasons;
  for (const [number, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('拒票原因记录格式不正确');
    const v = raw as Record<string, unknown>;
    if (
      !number.trim() ||
      v.number !== number ||
      typeof v.reason !== 'string' ||
      !v.reason.trim() ||
      v.reason.length > 10000 ||
      typeof v.recordedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v.recordedAt) ||
      !Number.isFinite(Date.parse(v.recordedAt)) ||
      typeof v.file !== 'string' ||
      !v.file ||
      v.file.includes('\\') ||
      posix.isAbsolute(v.file) ||
      win32.isAbsolute(v.file) ||
      v.file.split('/').some((part) => !part || part === '..' || part === '.')
    )
      throw new Error('拒票原因记录的发票号、原因、日期或相对路径不正确');
    out[number] = { number, reason: v.reason.trim(), recordedAt: v.recordedAt, file: v.file };
  }
  return out;
}
export async function readRejectedReasons(dir: string): Promise<RejectedReasons> {
  try {
    for (const file of [dir, join(dir, '_预检'), join(dir, REASONS_RELATIVE_PATH)])
      if ((await lstat(file)).isSymbolicLink()) throw new Error('拒票原因路径不能为符号链接');
    return validateRejectedReasons(
      JSON.parse(await readFile(join(dir, REASONS_RELATIVE_PATH), 'utf8')),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}
export function buildRejectedInfo(
  batch: Batch,
  config: RuleConfig,
  reasons: RejectedReasons = {},
): Map<string, RejectedInfo> {
  return new Map(
    batch.invoices.map((invoice) => {
      const isolated = {
        ...batch,
        invoices: [invoice],
        diagnostics: [],
        groups: batch.groups
          .filter((group) => group.invoiceNumbers.includes(invoice.number))
          .map((group) => ({ ...group, invoiceNumbers: [invoice.number] })),
      };
      const intrinsic = checkBatch(isolated, config).findings.filter((f) =>
        ['F2', 'buyer', 'F5'].includes(f.ruleId),
      );
      return [
        invoice.number,
        {
          number: invoice.number,
          ...(Object.hasOwn(reasons, invoice.number) ? { recorded: reasons[invoice.number] } : {}),
          inferred: [
            ...new Set(
              intrinsic
                .filter((f) => f.invoiceNumbers.includes(invoice.number))
                .map((f) => f.ruleId),
            ),
          ].map((ruleId) => ({ ruleId, name: ruleDefinition(ruleId)!.name })),
        },
      ];
    }),
  );
}
