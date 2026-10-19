import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
  lstat,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, posix } from 'node:path';
import type {
  CorrectionPreview,
  CorrectionRequest,
  CorrectionTarget,
} from '../../core/correction/types.js';
import {
  attachmentDestination,
  replacementDestination,
  newFileDestination,
  existingRelativePath,
  sameRelativeFile,
} from '../../core/correction/placement.js';
import {
  compareProblems,
  problemKey,
  relativeProblemFile,
  type ProblemAliases,
} from '../../core/correction/problems.js';
import { ATTACHMENT_LABELS } from '../../core/rules/catalog.js';
import { identifyAttachment } from '../../core/attachments.js';
import { readManual, validateManual } from '../../core/manual.js';
import type { Finding } from '../../core/types.js';
import type { LaborManualEntry } from '../../core/labor/types.js';
import { attachmentInScope } from './scope.js';
import { correctionTargets } from './targets.js';
import { CORRECTION_EXTENSIONS, identifyCorrectionFile } from './identify.js';
import type { CorrectionContext } from './context.js';
import { commitCorrection, undoCorrection, type CorrectionWritePlan } from './store.js';
import { copyDocuments, documentFiles, fileHash } from './files.js';

interface Trial {
  dir: string;
  temp: string;
  signature: string;
  plan: CorrectionWritePlan;
  passed: boolean;
  hashes: Record<string, string>;
  at: number;
}
export class CorrectionService {
  private trials = new Map<string, Trial>();
  constructor(private context: (dir: string) => Promise<CorrectionContext>) {}
  async targets(dir: string) {
    return correctionTargets(await this.context(dir));
  }
  async cancel(token: string) {
    const trial = this.trials.get(token);
    if (trial) {
      this.trials.delete(token);
      await rm(trial.temp, { recursive: true, force: true });
    }
  }
  async preview(request: CorrectionRequest): Promise<CorrectionPreview> {
    for (const [id, trial] of this.trials)
      if (Date.now() - trial.at > 30 * 60 * 1000) await this.cancel(id);
    const context = await this.context(request.dir);
    const targets = correctionTargets(context);
    const extension = extname(request.source).toLowerCase();
    if (!CORRECTION_EXTENSIONS.includes(extension.slice(1)))
      throw new Error('请选择 PDF、XML、OFD、Word 或图片单据');
    const info = await lstat(request.source);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('新文件必须为普通文件，不允许符号链接');
    const temp = await realpath(await mkdtemp(join(tmpdir(), 'precheck-single-file-')));
    let retained = false;
    try {
      const staged = join(temp, '候选' + extension);
      await writeFile(staged, await readFile(request.source));
      const incoming = await identifyCorrectionFile(
        staged,
        basename(request.source),
        context.config,
      );
      let target = request.targetId ? targets.find((t) => t.id === request.targetId) : undefined;
      if (request.targetId && !target) throw new Error('目标问题已变化，请重新检查后选择');
      if (!target) {
        let matches: CorrectionTarget[] = [];
        if (context.analysis.kind === 'batch' && incoming.invoice) {
          const old = context.analysis.batch!.invoices.find(
            (i) => i.number === incoming.invoice!.number,
          );
          if (old)
            matches = targets.filter((t) => t.kind === 'invoice' && t.invoiceNumber === old.number);
          else
            return {
              status: 'needs-target',
              message: '识别为新号码发票，请选择要放入的组',
              suggestedIds: targets.filter((t) => t.kind === 'group').map((t) => t.id),
            };
          target = matches.find((t) => t.findingKey) ?? matches[0];
        } else if (context.analysis.kind === 'labor' && incoming.labor?.name) {
          const entries = context.analysis.labor!.entries.filter(
            (e) => e.fields.name === incoming.labor!.name,
          );
          if (entries.length === 1) {
            matches = targets.filter(
              (t) => t.kind === 'labor' && t.relativePath === entries[0]!.relativePath,
            );
            target = matches.find((t) => t.findingKey) ?? matches[0];
          } else
            matches = targets.filter(
              (t) => t.kind === 'labor' && entries.some((e) => e.relativePath === t.relativePath),
            );
        } else if (incoming.attachmentType) {
          matches = targets.filter(
            (t) => t.kind === 'attachment' && t.attachmentType === incoming.attachmentType,
          );
          if (matches.length === 1) target = matches[0];
        }
        if (!target)
          return {
            status: 'needs-target',
            message: '无法唯一确定要解决的问题，请手动选择目标',
            suggestedIds: matches.map((t) => t.id),
          };
      }
      const copy = join(temp, 'copy');
      await copyDocuments(context.dir, copy);
      const existing = await documentFiles(copy);
      const relativeSource = existingRelativePath(context.dir, await realpath(request.source));
      const sourceInCopy =
        relativeSource && !relativeSource.split('/').includes('_预检')
          ? (existing.find((file) => sameRelativeFile(file, relativeSource)) ?? null)
          : null;
      let reuse = false;
      let confirmAttachment = false;
      let destination: string;
      let archive: string[] = [];
      const aliases: ProblemAliases = { files: {}, invoiceNumbers: {} };
      const blockers: string[] = [];
      if (target.kind === 'invoice' || target.kind === 'labor' || target.kind === 'file') {
        const sources = target.sources ?? [target.relativePath!];
        if (!sources.length) {
          destination = newFileDestination(target.folder, basename(request.source), existing);
        } else {
          const primary =
            target.relativePath && sources.includes(target.relativePath)
              ? [target.relativePath, ...sources.filter((s) => s !== target.relativePath)]
              : sources;
          const alternatives = primary.filter((s) => s !== sourceInCopy);
          const candidates = alternatives.length ? alternatives : primary;
          const replaced =
            candidates.find((s) => posix.extname(s).toLowerCase() === extension) ?? candidates[0]!;
          const sameFolder =
            sourceInCopy && posix.dirname(sourceInCopy) === posix.dirname(replaced);
          if (sameFolder) {
            destination = sourceInCopy!;
            archive = [replaced];
            reuse = true;
            aliases.files![destination] = replaced;
          } else {
            const placement = replacementDestination(primary, basename(request.source), existing);
            destination = placement.destination;
            archive = [placement.replaced];
            aliases.files![destination] = placement.replaced;
          }
        }
        if (target.kind === 'invoice') {
          if (!incoming.invoice)
            blockers.push(
              '新文件未能解析为发票，请提供可读取的 PDF / XML / OFD 版。' + incoming.parseError,
            );
          else if (target.invoiceNumber && incoming.invoice.number !== target.invoiceNumber) {
            archive = [...sources];
            aliases.invoiceNumbers![incoming.invoice.number] = target.invoiceNumber!;
          }
        }
        if (target.kind === 'labor') {
          if (!incoming.labor)
            blockers.push(
              '新文件未能识别为劳务情况说明，请提供有文字层的 PDF 或 Word。' + incoming.parseError,
            );
          if (sources.length > 1) archive = [...sources];
        }
      } else if (target.kind === 'group') {
        if (!incoming.invoice) blockers.push('放入新发票组时，新文件必须能解析成发票。');
        destination = newFileDestination(target.folder, basename(request.source), existing);
      } else {
        const invoice = target.invoiceNumber
          ? context.analysis.batch?.invoices.find((i) => i.number === target.invoiceNumber)
          : undefined;
        const object = invoice
          ? posix.basename(
              invoice.sources[0]!.relativePath,
              posix.extname(invoice.sources[0]!.relativePath),
            )
          : target.laborFile
            ? posix.basename(target.laborFile, posix.extname(target.laborFile))
            : (target.groupId ?? '根目录');
        const label = target.attachmentType
          ? ATTACHMENT_LABELS[target.attachmentType].split(' / ')[0]!
          : { settlement: '会议决算表', notice: '会议通知', attendance: '参会人员签到表' }[
              target.laborAttachmentType!
            ];
        const words = target.attachmentType
          ? context.config.attachmentKeywords[target.attachmentType]
          : context.config.labor.attachmentKeywords[target.laborAttachmentType!];
        const prefix = words.some((w) => label.includes(w)) ? label : (words[0] ?? label);
        confirmAttachment =
          !!sourceInCopy &&
          attachmentInScope(sourceInCopy, target, context) &&
          !!(target.attachmentType || target.laborAttachmentType);
        destination = confirmAttachment
          ? sourceInCopy!
          : attachmentDestination(target.folder, prefix, object, extension, existing);
        reuse = confirmAttachment;
      }
      const plan: CorrectionWritePlan = {
        destination,
        archive: [...new Set(archive)].filter((file) => !reuse || file !== destination),
        copies: reuse ? [] : [{ from: staged, to: destination }],
        ...(reuse
          ? {
              retained: [{ path: destination, sha256: await fileHash(join(copy, destination)) }],
              operation: confirmAttachment
                ? ('confirm-attachment' as const)
                : ('reuse-file' as const),
            }
          : {}),
        source: request.source,
        target: target.label,
        targetKey: target.findingKey ?? target.id,
      };
      archive = plan.archive;
      const manual = await readManual(copy);
      const next = structuredClone(manual);
      if (target.kind === 'labor') {
        const old = next.labor?.[target.relativePath!] ?? {};
        const preserved: LaborManualEntry = {};
        for (const key of [
          'nationalExpert',
          'seniorStaff',
          'tableAmount',
          'studentLevel',
          'workTime',
          'personnelRole',
        ] as const)
          if (old[key] !== undefined) Object.assign(preserved, { [key]: old[key] });
        if (next.labor) {
          for (const old of archive) delete next.labor[old];
          if (Object.keys(preserved).length) next.labor[destination] = preserved;
        }
      }
      if (target.kind === 'invoice') {
        const entries = next.entries;
        const filtered = entries.filter(
          (e, n) =>
            !(
              (target.invoiceNumber &&
                (e.number ?? `manual:${e.sourceFile ?? `${e.group}:${n + 1}`}`) ===
                  target.invoiceNumber) ||
              (e.sourceFile && archive.includes(e.sourceFile))
            ),
        );
        next.entries = filtered.map((entry, n) => {
          const originalIndex = entries.indexOf(entry);
          return !entry.number && !entry.sourceFile && originalIndex !== n
            ? { ...entry, number: `manual:${entry.group}:${originalIndex + 1}` }
            : entry;
        });
      }
      if (next.attachments)
        for (const old of archive)
          if (next.attachments[old]) {
            const type = next.attachments[old]!;
            delete next.attachments[old];
            if (old === aliases.files![destination] && target.kind === 'file')
              next.attachments[destination] = type;
          }
      if (
        target.attachmentType &&
        (confirmAttachment ||
          identifyAttachment(destination, context.config) !== target.attachmentType)
      )
        next.attachments = { ...next.attachments, [destination]: target.attachmentType };
      if (confirmAttachment && target.laborAttachmentType)
        next.laborAttachments = {
          ...next.laborAttachments,
          [destination]: target.laborAttachmentType,
        };
      if (next.laborAttachments) for (const old of archive) delete next.laborAttachments[old];
      if (JSON.stringify(next) !== JSON.stringify(manual)) {
        const support = join(temp, 'manual.json');
        await writeFile(support, JSON.stringify(validateManual(next), null, 2) + '\n');
        if (existing.includes('_预检/manual.json')) plan.archive.push('_预检/manual.json');
        plan.copies.push({ from: support, to: '_预检/manual.json' });
      }
      if (!plan.archive.length && !plan.copies.length)
        blockers.push('该文件已在目录内，没有需要放入的更改。');
      for (const rel of plan.archive) await rm(join(copy, rel));
      for (const item of plan.copies) {
        const file = join(copy, item.to);
        await mkdir(dirname(file), { recursive: true });
        await copyFile(item.from, file);
      }
      const after = await context.examine(copy);
      if (target.kind === 'invoice' || target.kind === 'group') {
        if (
          !after.batch?.invoices.some((i) => i.sources.some((s) => s.relativePath === destination))
        )
          blockers.push('模拟结果中没有识别到放入的发票，不能用移除原票来消除问题。');
      }
      if (
        target.kind === 'labor' &&
        !after.labor?.entries.some((e) => e.relativePath === destination)
      )
        blockers.push('模拟结果中没有识别到放入的情况说明。');
      let materialResolved = true;
      if (target.attachmentType)
        materialResolved = !after.report?.groups
          .find((g) => g.group.id === target.groupId)
          ?.requirements.some(
            (r) =>
              r.type === target.attachmentType &&
              r.status !== 'found' &&
              (!target.invoiceNumbers?.length ||
                r.invoiceNumbers.some((n) => target.invoiceNumbers!.includes(n))),
          );
      if (target.laborAttachmentType)
        materialResolved = !after.labor?.entries
          .find((e) => e.relativePath === target.laborFile)
          ?.requirements.some((r) => r.type === target.laborAttachmentType && r.status !== 'found');
      if (!materialResolved) blockers.push('目标材料仍为缺失或待确认，尚未解决。');
      const diff = compareProblems(
        context.analysis.findings,
        after.findings,
        context.dir,
        copy,
        target.findingKey,
        aliases,
      );
      const token = randomUUID();
      const passed = diff.passed && materialResolved && !blockers.length;
      const hashes: Record<string, string> = {};
      for (const item of plan.copies) hashes[item.from] = await fileHash(item.from);
      this.trials.set(token, {
        dir: context.dir,
        temp,
        signature: context.signature,
        plan,
        passed,
        hashes,
        at: Date.now(),
      });
      retained = true;
      const display = (findings: Finding[]) =>
        findings.map((f) => ({
          ...f,
          files: f.files.map((file) => join(context.dir, relativeProblemFile(copy, file))),
        }));
      return {
        status: 'checked',
        token,
        passed,
        resolved: diff.resolved && materialResolved,
        target: target.label,
        destination: join(context.dir, destination),
        targetRemaining: display(
          after.findings.filter(
            (f) =>
              f.severity !== 'info' &&
              target.findingKey &&
              problemKey(f, copy, aliases) === target.findingKey,
          ),
        ),
        operations: [
          ...(reuse
            ? [
                {
                  kind: confirmAttachment ? ('confirm-attachment' as const) : ('retain' as const),
                  from: request.source,
                  to: join(context.dir, destination),
                },
              ]
            : []),
          ...plan.archive.map((file) => ({
            kind: 'archive' as const,
            from: join(context.dir, file),
            to: join(context.dir, '_预检/旧版/<放入时刻>', file),
          })),
          ...plan.copies.map((item) => ({
            kind: 'copy' as const,
            from: item.to === '_预检/manual.json' ? '更新手填索引' : request.source,
            to: join(context.dir, item.to),
          })),
        ],
        added: display(
          [...new Set([...diff.added, ...diff.newErrors])].filter((f) => f.severity !== 'info'),
        ),
        remaining: display(diff.remaining),
        blockers,
      };
    } finally {
      if (!retained) await rm(temp, { recursive: true, force: true });
    }
  }
  async confirm(token: string): Promise<string> {
    const trial = this.trials.get(token);
    if (!trial?.passed) throw new Error('预检未通过或已失效，不能写入');
    if (Date.now() - trial.at > 30 * 60 * 1000) throw new Error('预览已过期，请重新模拟');
    const context = await this.context(trial.dir);
    if (context.signature !== trial.signature)
      throw new Error('工作区、设置或历史已有变化，请重新模拟检查');
    for (const [file, hash] of Object.entries(trial.hashes))
      if ((await fileHash(file)) !== hash) throw new Error('检查快照已变化，请重新模拟');
    await commitCorrection(trial.dir, trial.plan);
    await this.cancel(token);
    return trial.dir;
  }
  async undo(dir: string, expectedId?: string) {
    await this.context(dir);
    await undoCorrection(dir, expectedId);
    return dir;
  }
}
