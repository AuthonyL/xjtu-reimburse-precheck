import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportLabRules } from '../scripts/export-lab-rules.js';
import { validateSettings } from '../src/main/store.js';

it('从私有输入导出完整 APP 规则，理由置首且通过实际导入校验', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lab-rule-export-'));
  await mkdir(join(root, 'private'));
  await writeFile(
    join(root, 'private/lab-reasons.json'),
    JSON.stringify({ highValueReasons: ['合成私有理由'] }),
  );
  const file = await exportLabRules(root);
  const imported = validateSettings(JSON.parse(await readFile(file, 'utf8')));
  expect(imported.rules.highValueReasons[0]).toBe('合成私有理由');
  expect(imported.rules.highValueReasons[1]).toContain('{材料名称}');
});
