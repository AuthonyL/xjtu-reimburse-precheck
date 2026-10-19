import { basename, dirname, relative, sep } from 'node:path';
import type { Attachment, AttachmentType } from './types.js';
import { containsAny, loadConfig, type RuleConfig } from './rules/config.js';

export { ATTACHMENT_LABELS as attachmentLabels } from './rules/catalog.js';
import { ATTACHMENT_LABELS as attachmentLabels } from './rules/catalog.js';
const priority: AttachmentType[] = [
  'purposeNote',
  'acceptanceNote',
  'schoolForm',
  'repairList',
  'itinerary',
  'waybill',
  'systemApproval',
  'highValueApproval',
  'inventory',
  'payment',
  'store',
  'exchangeRate',
  'subscription',
  'assetRegistration',
  'explanation',
  'verification',
  'contract',
  'designList',
];
export function identifyAttachment(
  file: string,
  config: RuleConfig = loadConfig(),
): AttachmentType | null {
  const name = basename(file);
  if (/^0320\d{10}.*\.pdf$/i.test(name)) return 'schoolForm';
  const direct = priority.find((type) => containsAny(name, config.attachmentKeywords[type]));
  if (direct) return direct;
  for (const directory of dirname(file).split(sep).reverse()) {
    if (!containsAny(directory, config.materialDirectoryKeywords)) continue;
    const type = priority.find(
      (type) => type !== 'schoolForm' && containsAny(directory, config.attachmentKeywords[type]),
    );
    if (type) return type;
  }
  return null;
}
export const isAttachmentType = (value: unknown): value is AttachmentType =>
  typeof value === 'string' && Object.hasOwn(attachmentLabels, value);
export const canBeUnnamedAttachment = (file: string): boolean =>
  /\.(pdf|png|jpe?g|webp|heic|tiff?|bmp)$/i.test(file);
export const requirementStatusLabels = {
  found: '已找到',
  unconfirmed: '待确认',
  missing: '缺失',
} as const;
export function makeAttachment(
  file: string,
  batchDir: string,
  type: Attachment['type'],
): Attachment {
  return {
    path: file,
    relativePath: relative(batchDir, file).split(sep).join('/'),
    directory: dirname(file),
    type,
  };
}
