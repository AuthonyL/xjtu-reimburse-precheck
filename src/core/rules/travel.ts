import { samePath } from '../fs-path.js';
import { basename, dirname, extname } from 'node:path';
import type { Attachment, Batch, Invoice } from '../types.js';
export function itineraryAmounts(file: string, text = ''): number[] {
  const values = [
    ...basename(file).matchAll(/([\d,]+(?:\.\d{1,2})?)\s*元/g),
    ...text.normalize('NFKC').matchAll(/合\s*计[\s:：¥￥]*([\d,]+(?:\.\d{1,2})?)\s*元/g),
  ]
    .map((m) => Number(m[1]!.replaceAll(',', '')))
    .filter(Number.isFinite);
  return [...new Set(values)];
}
export function itineraryPrefix(file: string): string {
  return basename(file, extname(file))
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/^行程单-/, '')
    .replace(/(?:电子)?(?:行程单|发票|行程)$/, '');
}
export interface TravelMatch {
  files: Attachment[];
  candidates: Attachment[];
  fallback: boolean;
}
export function matchItineraries(batch: Batch, invoices: Invoice[]): Map<string, TravelMatch> {
  const files = batch.attachments.filter((a) => a.type === 'itinerary');
  const used = new Set<string>();
  const found = new Map<string, Attachment>();
  const local = (invoice: Invoice) =>
    files.filter((a) => invoice.sources.some((s) => samePath(dirname(s.path), a.directory)));
  const samePrefix = (i: Invoice, a: Attachment) =>
    i.sources.some(
      (s) => itineraryPrefix(s.path) === itineraryPrefix(a.path) && !!itineraryPrefix(a.path),
    );
  const sameAmount = (i: Invoice, a: Attachment) =>
    [...(a.amounts ?? []), ...itineraryAmounts(a.path)].some(
      (amount) => Math.abs(amount - i.total) <= 0.010000001,
    );
  for (const matches of [samePrefix, sameAmount]) {
    const remaining = invoices.filter((i) => !found.has(i.number));
    const choices = new Map(
      remaining.map((i) => [i.number, local(i).filter((a) => !used.has(a.path) && matches(i, a))]),
    );
    for (const i of remaining) {
      const candidates = choices.get(i.number)!;
      if (candidates.length !== 1) continue;
      const file = candidates[0]!;
      if (
        remaining.filter((other) => choices.get(other.number)!.some((a) => a.path === file.path))
          .length !== 1
      )
        continue;
      found.set(i.number, file);
      used.add(file.path);
    }
  }
  return new Map(
    invoices.map((i) => [
      i.number,
      {
        files: found.has(i.number) ? [found.get(i.number)!] : [],
        candidates: found.has(i.number) ? [] : local(i).filter((a) => !used.has(a.path)),
        fallback: false,
      },
    ]),
  );
}
