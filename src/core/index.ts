import { scanRootBatches } from './discovery.js';
import { join } from 'node:path';
import type { Batch, CheckContext, RootResult, ScanOptions } from './types.js';
import { scanBatch } from './scan.js';
import { checkBatch } from './rules/engine.js';
import { loadConfig, type RuleConfig } from './rules/config.js';
import { buildRejectedInfo, readRejectedReasons } from './rejected.js';
import { buildReport } from './report.js';
import { findLaborDirectories, scanLaborDirectory } from './labor/scan.js';
import { checkLabor } from './labor/engine.js';
import { probe, readSelectedDirectory } from './fs-probe.js';

export * from './types.js';
export * from './batch-order.js';
export * from './discovery.js';
export * from './scan.js';
export * from './attachments.js';
export * from './rules/config.js';
export * from './rules/engine.js';
export * from './report.js';
export * from './export/index.js';
export * from './parse/xml.js';
export * from './parse/pdf.js';
export * from './parse/foreign.js';
export * from './parse/ofd.js';
export * from './manual.js';
export * from './rejected.js';
export * from './rules/catalog.js';
export * from './labor/types.js';
export * from './labor/parse.js';
export * from './labor/scan.js';
export * from './labor/engine.js';
export * from './labor/template.js';

export async function checkRoot(
  rootDir: string,
  config: RuleConfig = loadConfig(),
  opts: ScanOptions & Omit<CheckContext, 'otherBatches'> = {},
): Promise<RootResult> {
  const entries = await readSelectedDirectory(rootDir);
  const batches = await scanRootBatches(rootDir, config);
  const rejectedNumbers = new Set(opts.rejectedNumbers);
  let rejected: Batch | null = null;
  if (entries.some((e) => e.isDirectory() && e.name === '无法报销费用')) {
    rejected = await probe(() => scanBatch(join(rootDir, '无法报销费用'), { config }));
    rejected?.invoices.forEach((i) => rejectedNumbers.add(i.number));
  }
  const rejectedInfo = new Map(opts.rejectedInfo);
  if (rejected)
    for (const [number, info] of buildRejectedInfo(
      rejected,
      config,
      await readRejectedReasons(rejected.dir),
    ))
      rejectedInfo.set(number, info);
  const results = batches.map((b) =>
    checkBatch(b, config, {
      otherBatches: batches.filter((other) => other !== b),
      submittedHistory: opts.submittedHistory,
      rejectedNumbers,
      rejectedInfo,
    }),
  );
  return {
    batches,
    results,
    reports: results.map(buildReport),
    rejectedNumbers,
    rejected,
    rejectedInfo,
    labor: (
      await Promise.all(
        (await findLaborDirectories(rootDir, config)).map(async (dir) =>
          probe(async () => checkLabor(await scanLaborDirectory(dir, config), config)),
        ),
      )
    ).filter((report) => report !== null),
  };
}
