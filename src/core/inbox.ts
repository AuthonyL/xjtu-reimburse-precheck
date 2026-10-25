import type { AttachmentType, Batch, InboxItem } from './types.js';
import type { RuleConfig } from './rules/config.js';
export type { InboxItem } from './types.js';

const normalized = (value: string) => value.replace(/\s/g, '').toLowerCase();

export function buildInbox(batches: readonly Batch[], config: RuleConfig): InboxItem[] {
  const keywords = Object.entries(config.attachmentKeywords)
    .flatMap(([type, words]) =>
      words.map((word) => ({ type: type as AttachmentType, keyword: normalized(word) })),
    )
    .sort((a, b) => b.keyword.length - a.keyword.length);
  return batches.flatMap((batch) => {
    const ignored = new Set(batch.manual.ignored ?? []);
    const files = [
      ...batch.unidentified.map((file) => ({
        ...file,
        kind: file.parseFailed ? ('parseFailed' as const) : ('unidentified' as const),
      })),
      ...batch.attachments
        .filter((file) => file.type === 'unnamed')
        .map((file) => ({
          ...file,
          kind: 'unnamed' as const,
        })),
    ];
    return files
      .filter((file) => !ignored.has(file.relativePath))
      .map((file) => {
        const parts = file.relativePath.split('/');
        const name = normalized(parts.at(-1)!);
        return {
          path: file.path,
          relativePath: file.relativePath,
          batchDir: batch.dir,
          group: parts.length > 1 ? parts[0]! : '根目录',
          kind: file.kind,
          suggestions: [
            ...new Set(
              keywords
                .filter(({ keyword }) => keyword && name.includes(keyword))
                .map(({ type }) => type),
            ),
          ],
        };
      });
  });
}
