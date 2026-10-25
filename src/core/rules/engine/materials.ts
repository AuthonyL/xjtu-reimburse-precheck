import { dirname } from 'node:path';
import { pathKey, relativePath, samePath } from '../../fs-path.js';
import { groupName } from '../../group.js';
import type { Attachment, AttachmentType, Batch, Group, Invoice } from '../../types.js';
import { containsAny, type RuleConfig } from '../config.js';

export function findMaterials(
  batch: Batch,
  type: AttachmentType,
  invoices: Invoice[],
  config: RuleConfig,
  group: Group,
): { files: Attachment[]; fallback: boolean; candidates: Attachment[] } {
  const candidates = batch.attachments.filter(
    (a) => a.type === type || (type === 'designList' && a.type === 'repairList'),
  );
  const directories = new Set(
    invoices.length
      ? invoices.flatMap((i) =>
          i.sources
            .filter((s) => groupName(batch.dir, s.path) === group.name)
            .map((s) => pathKey(dirname(s.path))),
        )
      : [pathKey(group.dir)],
  );
  const local = candidates.filter((a) => directories.has(pathKey(a.directory)));
  if (type === 'waybill') return { files: local, fallback: false, candidates: [] };
  if (local.length)
    return {
      files: local,
      fallback: local.some((a) => samePath(a.directory, batch.dir)),
      candidates: [],
    };
  const fallback = candidates.filter((a) => {
    if (samePath(a.directory, batch.dir)) return true;
    const parts = relativePath(batch.dir, a.path).split('/');
    return (
      parts.length > 1 &&
      containsAny(parts[0]!, config.attachmentKeywords[type]) &&
      containsAny(parts[0]!, config.materialDirectoryKeywords)
    );
  });
  const unnamed = config.unconfirmedAttachmentTypes.includes(type)
    ? batch.attachments.filter((a) => a.type === 'unnamed' && directories.has(pathKey(a.directory)))
    : [];
  return {
    files: fallback,
    fallback: fallback.length > 0,
    candidates: fallback.length ? [] : unnamed,
  };
}
