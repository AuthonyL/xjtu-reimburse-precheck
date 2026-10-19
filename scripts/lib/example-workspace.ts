import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exampleDocx, exampleXml, exampleJpg } from './example-documents.js';
import { laborText } from '../../tests/labor-fixtures.js';
import { syntheticPdf } from '../../tests/pdf-fixture.js';
import { loadConfig } from '../../src/core/rules/config.js';
import { DEFAULT_BOC_URL } from '../../src/main/store.js';

/** 只写调用者给定的临时目录，供截图和合成数据检查使用。 */
export async function createExampleWorkspace(directory: string) {
  const root = join(directory, '示例', '发票');
  const userData = join(directory, 'user-data');
  const batch = join(root, '20260103');
  const labor = join(root, '劳务费');
  await Promise.all([
    mkdir(join(batch, 'PCB'), { recursive: true }),
    mkdir(join(batch, 'AI'), { recursive: true }),
    mkdir(join(root, '20260102'), { recursive: true }),
    mkdir(labor, { recursive: true }),
    mkdir(join(root, '无法报销费用'), { recursive: true }),
    mkdir(userData, { recursive: true }),
  ]);
  await writeFile(join(batch, 'PCB/发票甲.xml'), exampleXml('SYNTH-EXAMPLE-A'));
  await writeFile(join(batch, 'PCB/发票乙.xml'), exampleXml('SYNTH-EXAMPLE-B'));
  await writeFile(join(batch, 'PCB/abcdef0123456789.jpg'), exampleJpg);
  await writeFile(join(batch, 'AI/订阅说明.jpg'), exampleJpg);
  await writeFile(join(batch, '办公用品.xml'), exampleXml('SYNTH-EXAMPLE-C', '办公用品'));
  await writeFile(join(root, '20260102/合成发票.pdf'), syntheticPdf());
  await writeFile(join(labor, '示例发放说明.docx'), await exampleDocx(laborText));
  await writeFile(
    join(labor, '待补充发放说明.docx'),
    await exampleDocx(
      laborText
        .replace('林示例', '周示例')
        .replace('2026年8月1日、9月5日', '2026年8月、9月')
        .replace('线上', ''),
    ),
  );
  await writeFile(join(labor, '发放表.pdf'), syntheticPdf(false));
  await writeFile(join(root, '无法报销费用/参考票.xml'), exampleXml('SYNTH-REJECTED', '合成文具'));
  await writeFile(
    join(userData, 'settings.json'),
    JSON.stringify({
      bocUrl: DEFAULT_BOC_URL,
      rules: loadConfig({ buyer: { name: '合成大学', taxId: 'SYNTHBUYER00000001' } }),
    }),
  );
  return { root, userData, batch, labor };
}
