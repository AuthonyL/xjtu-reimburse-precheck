import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from '../../src/core/rules/config.js';
import { DEFAULT_BOC_URL } from '../../src/main/store.js';
import { syntheticPdf } from '../../tests/pdf-fixture.js';
import {
  exampleDocx as doc,
  exampleXml as xml,
  exampleJpg as jpg,
  examplePng,
} from './example-documents.js';
import { laborText } from '../../tests/labor-fixtures.js';

export async function createE2eWorkspace() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-electron-e2e-')));
  const root = join(temp, '合成工作区');
  const batch = join(root, '20260102');
  const newer = join(root, '20260103');
  const rejected = join(root, '无法报销费用');
  const userData = join(temp, 'user-data');
  const resultDir = resolve('test-results');
  await mkdir(join(batch, 'PCB'), { recursive: true });
  await mkdir(join(batch, 'AI'));
  await mkdir(newer);
  const correctionLabor = join(newer, '劳务费');
  await mkdir(correctionLabor);
  const incorrectText = laborText
    .replace('2026年8月1日、9月5日', '2026年8月、9月')
    .replace('线上', '');
  const correctSource = join(temp, '改好发放说明.docx');
  const incorrectSource = join(temp, '仍缺日期发放说明.docx');
  await writeFile(correctSource, await doc(laborText));
  await writeFile(
    incorrectSource,
    await doc(laborText.replace('2026年8月1日、9月5日', '2026年8月、9月')),
  );
  await writeFile(join(correctionLabor, '待改说明.docx'), await doc(incorrectText));
  const purposeSource = join(temp, '补充材料.pdf');
  await writeFile(purposeSource, syntheticPdf(false));
  await mkdir(rejected);
  await mkdir(join(root, '劳务费'));
  await writeFile(join(root, '劳务费/不应扫描.xml'), 'synthetic ignored document');
  for (const [file, text] of [
    ['正确发放说明.docx', laborText],
    [
      '错误发放说明.docx',
      laborText.replace('2026年8月1日、9月5日', '2026年8月、9月').replace('线上', ''),
    ],
  ])
    await writeFile(join(root, '劳务费', file!), await doc(text!));
  await writeFile(join(root, '劳务费', '发放表.pdf'), syntheticPdf(false));
  await mkdir(userData);
  await mkdir(resultDir, { recursive: true });
  await writeFile(join(newer, 'one.xml'), xml('SYNTH-DESKTOP-NEWER', '合成文具'));
  await writeFile(join(batch, 'PCB/one.xml'), xml('SYNTH-DESKTOP-ONE', '合成规则测试器件'));
  await writeFile(join(batch, 'PCB/two.xml'), xml('SYNTH-DESKTOP-TWO'));
  await writeFile(join(batch, '文字版合成发票.pdf'), syntheticPdf());
  await writeFile(join(rejected, '合成拒票.xml'), xml('SYNTH-DESKTOP-ONE', '合成规则测试器件'));
  await writeFile(join(batch, 'PCB/abcdef0123456789.jpg'), jpg);
  await writeFile(join(batch, 'AI/订阅说明.jpg'), jpg);
  const internalImage = join(batch, 'AI/0123456789abcdef.png');
  await writeFile(internalImage, examplePng);
  await writeFile(
    join(userData, 'settings.json'),
    JSON.stringify({
      bocUrl: DEFAULT_BOC_URL,
      rules: loadConfig({ buyer: { name: '合成大学', taxId: 'SYNTHBUYER00000001' } }),
    }),
  );
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  env.PRECHECK_USER_DATA = userData;
  env.PRECHECK_FEEDBACK_EXPORT = join(temp, 'feedback.zip');
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    temp,
    root,
    batch,
    newer,
    rejected,
    userData,
    resultDir,
    env,
    correctionLabor,
    correctSource,
    incorrectSource,
    purposeSource,
    internalImage,
  };
}
export type E2eWorkspace = Awaited<ReturnType<typeof createE2eWorkspace>>;
