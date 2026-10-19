import { posix } from 'node:path';
import type { CorrectionTarget } from '../../core/correction/types.js';
import { existingRelativePath } from '../../core/correction/placement.js';
import { containsAny } from '../../core/rules/config.js';
import { groupName } from '../../core/group.js';
import type { CorrectionContext } from './context.js';
const folder = (path: string) => (posix.dirname(path) === '.' ? '' : posix.dirname(path));
export function attachmentInScope(
  file: string,
  target: CorrectionTarget,
  context: CorrectionContext,
): boolean {
  if (file.split('/').includes('_预检')) return false;
  const sourceFolder = folder(file);
  if (target.laborAttachmentType) return sourceFolder === target.folder;
  if (!target.attachmentType || !context.analysis.batch) return false;
  const { batch } = context.analysis;
  const group = batch.groups.find((g) => g.id === target.groupId);
  if (!group) return false;
  const invoices = batch.invoices.filter((i) => target.invoiceNumbers?.includes(i.number));
  const local = invoices.length
    ? invoices.flatMap((i) =>
        i.sources
          .filter((s) => groupName(context.dir, s.path) === group.name)
          .map((s) => folder(s.relativePath)),
      )
    : [existingRelativePath(context.dir, group.dir) ?? ''];
  if (local.includes(sourceFolder)) return true;
  if (['itinerary', 'waybill'].includes(target.attachmentType)) return false;
  if (sourceFolder === '') return true;
  const first = file.split('/')[0]!;
  return (
    containsAny(first, context.config.attachmentKeywords[target.attachmentType]) &&
    containsAny(first, context.config.materialDirectoryKeywords)
  );
}
