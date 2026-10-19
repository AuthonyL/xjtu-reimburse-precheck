import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Batch } from './types.js';
import type { RuleConfig } from './rules/config.js';
import { listDocuments, scanBatch } from './scan.js';
import { findLaborDirectories, isLaborDirectoryName } from './labor/scan.js';
import { compareBatches } from './batch-order.js';
export function isBatchDirectoryName(name: string, config: RuleConfig): boolean {
  return (
    !name.startsWith('.') &&
    !['tmp', '_预检', '无法报销费用'].includes(name) &&
    !isLaborDirectoryName(name, config)
  );
}
export async function candidateBatchDirectories(
  root: string,
  config: RuleConfig,
): Promise<string[]> {
  return (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.isSymbolicLink() && isBatchDirectoryName(e.name, config))
    .map((e) => join(root, e.name))
    .sort();
}
export async function scanRootBatches(root: string, config: RuleConfig): Promise<Batch[]> {
  const batches: Batch[] = [];
  for (const dir of await candidateBatchDirectories(root, config)) {
    const batch = await scanBatch(dir, { config });
    let content = !!(
      batch.invoices.length ||
      batch.attachments.length ||
      batch.unidentified.some((f) => f.parseFailed || f.isPdf)
    );
    if (!content)
      for (const labor of await findLaborDirectories(dir, config, 'batch'))
        if ((await listDocuments(labor, config)).length) {
          content = true;
          break;
        }
    if (content) batches.push(batch);
  }
  return batches.sort(compareBatches);
}
