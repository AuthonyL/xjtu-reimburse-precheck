import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importFeedback } from '../src/core/feedback/import.js';
const args = process.argv.slice(2);
if (!args[0] || (args.length > 1 && (args[1] !== '--out' || !args[2] || args.length !== 3))) {
  console.error('用法：npm run import-feedback -- <反馈.zip> [--out <目录>]');
  process.exitCode = 1;
} else {
  try {
    const result = await importFeedback(await readFile(resolve(args[0])), resolve(args[2] ?? '.'));
    console.log(
      `已生成 ${result.created.length} 个文件，跳过 ${result.skipped.length} 个已有文件。\n报告：${result.report}`,
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
