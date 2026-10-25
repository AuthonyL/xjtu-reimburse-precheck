import { useEffect, useState } from 'react';
import type { LaborEntry, LaborManualEntry } from '../../../core/labor/types.js';
import type { RuleConfig } from '../../../core/rules/config.js';
import { applyLaborManual } from '../../../core/labor/parse.js';

export function useLaborDraft(entry: LaborEntry, config: RuleConfig) {
  const [draft, setDraft] = useState<LaborManualEntry>(structuredClone(entry.manual));
  const [datesText, setDatesText] = useState(entry.fields.dates.map((d) => d.date).join('\n'));
  const stored = JSON.stringify(entry.manual);
  const parsed = JSON.stringify(entry.parsed);
  useEffect(() => {
    setDraft(structuredClone(entry.manual));
    setDatesText(entry.fields.dates.map((d) => d.date).join('\n'));
  }, [stored, parsed]);
  const fields = applyLaborManual(entry.parsed, draft, config);
  const set = (key: keyof LaborManualEntry, value: unknown) =>
    setDraft((old) => ({ ...old, [key]: value }));
  return { draft, setDraft, datesText, setDatesText, fields, set };
}
export type LaborDraft = ReturnType<typeof useLaborDraft>;
