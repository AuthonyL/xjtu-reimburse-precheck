import { join } from 'node:path';
import { readdir, realpath } from 'node:fs/promises';
import type { RuleConfig } from '../core/rules/config.js';
import type { LaborManualEntry, LaborScan } from '../core/labor/types.js';
import type { LaborView } from '../shared/api.js';
import { scanLaborDirectory } from '../core/labor/scan.js';
import { checkLabor } from '../core/labor/engine.js';
import { exportLaborDocx, laborDocxName } from '../core/labor/template.js';
import { readManual, validateManual } from '../core/manual.js';
import { assertDirectory, batchFile, manualPath, outputDirectory } from './paths.js';
import { writeJson } from './json-store.js';
import { readReplacementHistory } from './correction/store.js';

export class LaborService {
  private scans = new Map<string, LaborScan>();
  views: LaborView[] = [];
  async refresh(
    dirs: string[],
    config: RuleConfig,
    changed?: string,
    cached = false,
  ): Promise<LaborView[]> {
    const scans = cached || changed ? new Map(this.scans) : new Map<string, LaborScan>();
    for (const dir of dirs)
      if (!cached && (!changed || changed === dir)) {
        await assertDirectory(dir);
        scans.set(dir, await scanLaborDirectory(dir, config));
      }
    const views: LaborView[] = [];
    for (const scan of scans.values()) {
      const output = await batchFile(scan.dir, '_预检', true);
      let outputs: string[] = [];
      try {
        outputs = (await readdir(output, { withFileTypes: true }))
          .filter((e) => e.isFile() && /^情况说明-.+\.docx$/.test(e.name))
          .map((e) => join(output, e.name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      views.push({
        report: checkLabor(scan, config),
        outputs,
        replacements: await readReplacementHistory(scan.dir),
      });
    }
    this.scans = scans;
    this.views = views;
    return views;
  }
  private statement(dir: string, file: string) {
    const statement = this.scans.get(dir)?.statements.find((s) => s.relativePath === file);
    if (!statement) throw new Error('只能编辑当前劳务目录中已识别的情况说明');
    return statement;
  }
  async save(dir: string, file: string, entry: LaborManualEntry) {
    this.statement(dir, file);
    await batchFile(dir, file);
    await batchFile(dir, '_预检/manual.json', true);
    const data = await readManual(dir);
    data.labor = { ...data.labor, [file]: entry };
    const validated = validateManual(data);
    await writeJson(join(await outputDirectory(dir), 'manual.json'), validated);
  }
  async export(dir: string, file: string, config: RuleConfig) {
    this.statement(dir, file);
    await batchFile(dir, file);
    const scan = await scanLaborDirectory(dir, config);
    const entry = checkLabor(scan, config).entries.find((e) => e.relativePath === file);
    if (!entry) throw new Error('情况说明已不存在，请重新检查');
    await batchFile(dir, '_预检/' + laborDocxName(entry.fields.name), true);
    return exportLaborDocx(entry.fields, config, await outputDirectory(dir));
  }
  async allowedFile(input: string): Promise<string | null> {
    for (const view of this.views) {
      if (
        ![
          ...view.report.entries.map((e) => e.path),
          ...view.report.attachments.map((a) => a.path),
          ...view.outputs,
        ].includes(input)
      )
        continue;
      const safe = await batchFile(view.report.dir, manualPath(view.report.dir, input));
      const canonical = await realpath(safe);
      manualPath(view.report.dir, canonical);
      return canonical;
    }
    return null;
  }
}
