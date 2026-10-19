import { join } from 'node:path';
import type { AttachmentType, ManualEntry } from '../core/types.js';
import { readManual, validateManual } from '../core/manual.js';
import { batchFile, outputDirectory } from './paths.js';
import { SerialQueue, writeJson } from './json-store.js';

const queue = new SerialQueue();
export function saveAttachment(batch: string, file: string, type: AttachmentType) {
  return queue.run(async () => {
    await batchFile(batch, file);
    const data = await readManual(batch);
    data.attachments = { ...data.attachments, [file]: type };
    const validated = validateManual(data);
    await writeJson(join(await outputDirectory(batch), 'manual.json'), validated);
    return validated;
  });
}
export function saveManualEntry(batch: string, entry: ManualEntry) {
  return queue.run(async () => {
    if (entry.sourceFile) await batchFile(batch, entry.sourceFile);
    const data = await readManual(batch);
    const key = (v: ManualEntry) => v.sourceFile ?? `group:${v.group}:${v.number ?? ''}`;
    const index = data.entries.findIndex((v) => key(v) === key(entry));
    if (index >= 0) data.entries[index] = entry;
    else data.entries.push(entry);
    const validated = validateManual(data);
    await writeJson(join(await outputDirectory(batch), 'manual.json'), validated);
    return validated;
  });
}
