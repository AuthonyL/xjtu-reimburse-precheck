import { join } from 'node:path';
import { writeFile, mkdir, lstat } from 'node:fs/promises';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
import type { RuleConfig } from '../rules/config.js';
import type { LaborFields } from './types.js';

export { generateLaborText, formatLaborDate } from './template-text.js';
import { generateLaborText } from './template-text.js';
export function laborDocxName(name: string | null): string {
  const safe =
    (name ?? '未填姓名')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 60) || '未填姓名';
  return `情况说明-${safe}.docx`;
}
export async function exportLaborDocx(
  fields: LaborFields,
  config: RuleConfig,
  targetDir: string,
): Promise<string> {
  await mkdir(targetDir, { recursive: true });
  const file = join(targetDir, laborDocxName(fields.name));
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new Error('导出文件不能为符号链接');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: '宋体', size: 28 }, paragraph: { spacing: { line: 420 } } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [new TextRun({ text: '情况说明', bold: true, size: 36, font: '黑体' })],
          }),
          new Paragraph({
            indent: { firstLine: 560 },
            children: [new TextRun(generateLaborText(fields, config))],
          }),
        ],
      },
    ],
  });
  await writeFile(file, await Packer.toBuffer(doc));
  return file;
}
