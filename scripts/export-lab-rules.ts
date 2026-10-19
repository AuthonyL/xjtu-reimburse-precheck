import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/core/rules/config.js';
import { DEFAULT_BOC_URL, validateSettings } from '../src/main/store.js';

export async function exportLabRules(root = resolve('.')): Promise<string> {
  const input: unknown = JSON.parse(
    await readFile(resolve(root, 'private/lab-reasons.json'), 'utf8'),
  );
  const reasons = (input as { highValueReasons?: unknown })?.highValueReasons;
  if (
    !Array.isArray(reasons) ||
    !reasons.length ||
    reasons.some((s) => typeof s !== 'string' || !s.trim())
  )
    throw new Error('私有输入 highValueReasons 必须是非空字符串数组');
  const defaults = loadConfig();
  const settings = validateSettings({
    bocUrl: DEFAULT_BOC_URL,
    rules: {
      ...defaults,
      highValueReasons: [...new Set([...reasons, ...defaults.highValueReasons])],
    },
  });
  const output = resolve(root, 'private/课题组规则.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(settings, null, 2) + '\n');
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log('已生成可在 APP 导入的规则文件：' + (await exportLabRules()));
