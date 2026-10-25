import { writeFile } from 'node:fs/promises';
import type { WorkspaceView } from '../shared/api.js';
import type { Registry } from '../core/domain/registry.js';
import { renderLedger } from '../core/export/ledger.js';
import { ledgerClaims } from '../shared/ledger.js';
import { batchFile, outputDirectory } from './paths.js';

export async function writeLedger(view: WorkspaceView | null, registry: Registry): Promise<string> {
  if (!view) throw new Error('请先选择文件夹');
  if (view.rejected && !view.batches.length && !view.labor?.length)
    throw new Error('无法报销费用为只读参考目录');
  const file = await batchFile(view.dir, '_预检/台账.md', true);
  await outputDirectory(view.dir);
  await writeFile(file, renderLedger(ledgerClaims(view), registry), 'utf8');
  return file;
}
