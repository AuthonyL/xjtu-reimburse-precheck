import { loadConfig } from '../src/core/rules/config.js';
import { parseLaborText } from '../src/core/labor/parse.js';
import type { LaborFields, LaborScan, LaborManualEntry } from '../src/core/labor/types.js';

export const laborText =
  '合成大学信息学院林示例副教授于2026年8月1日、9月5日就合成工艺提供线上专家咨询服务两次，每次咨询费1100元，共计2200元。现予以发放。特此说明。';
export function laborScan(
  fields: Partial<LaborFields> = {},
  manual: LaborManualEntry = {},
): LaborScan {
  return {
    dir: '/synthetic/劳务费',
    statements: [
      {
        path: '/synthetic/劳务费/说明.docx',
        relativePath: '说明.docx',
        text: laborText,
        parsed: {
          ...parseLaborText(laborText, loadConfig()),
          ...fields,
          ...(fields.unit !== undefined && fields.priceUnit === undefined
            ? { priceUnit: fields.unit }
            : {}),
        },
      },
    ],
    attachments: [],
    manual: { version: 1, entries: [], labor: { '说明.docx': manual } },
    diagnostics: [],
  };
}
