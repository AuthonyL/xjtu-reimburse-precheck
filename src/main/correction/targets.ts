import { posix } from 'node:path';
import type { CorrectionTarget } from '../../core/correction/types.js';
import { problemKey, relativeProblemFile } from '../../core/correction/problems.js';
import { ATTACHMENT_LABELS } from '../../core/rules/catalog.js';
import type { CorrectionContext } from './context.js';

export function correctionTargets(context: CorrectionContext): CorrectionTarget[] {
  const { analysis, dir } = context;
  const targets: CorrectionTarget[] = [];
  const folder = (file: string) => (posix.dirname(file) === '.' ? '' : posix.dirname(file));
  if (analysis.kind === 'labor') {
    for (const finding of analysis.labor!.diagnostics.filter((f) => f.severity !== 'info')) {
      for (const path of finding.files) {
        const rel = relativeProblemFile(dir, path);
        if (rel.startsWith('_预检/')) continue;
        const statement = context.config.labor.statementKeywords.some((k) =>
          posix.basename(rel).includes(k),
        );
        targets.push({
          id: 'labor-diagnostic:' + rel + ':' + problemKey(finding, dir),
          label: `${rel} · ${finding.ruleId} · ${finding.message}`,
          kind: statement ? 'labor' : 'file',
          findingKey: problemKey(finding, dir),
          relativePath: rel,
          sources: [rel],
          folder: folder(rel),
          ...(statement ? { laborFile: rel } : {}),
        });
      }
    }
    for (const entry of analysis.labor!.entries) {
      for (const finding of entry.findings.filter((f) => f.severity !== 'info')) {
        const key = problemKey(finding, dir);
        const requirement = entry.requirements.find(
          (r) =>
            r.status !== 'found' && finding.ruleId === 'L5' && finding.message.includes(r.label),
        );
        targets.push({
          id: 'labor:' + entry.relativePath + ':' + key,
          label: `${entry.relativePath} · ${finding.ruleId} · ${finding.message}`,
          kind: requirement ? 'attachment' : 'labor',
          findingKey: key,
          relativePath: entry.relativePath,
          sources:
            finding.ruleId === 'L6'
              ? finding.files.map((f) => relativeProblemFile(dir, f))
              : [entry.relativePath],
          folder: folder(entry.relativePath),
          laborFile: entry.relativePath,
          ...(requirement ? { laborAttachmentType: requirement.type } : {}),
        });
      }
      targets.push({
        id: 'labor-file:' + entry.relativePath,
        label: '替换情况说明：' + entry.relativePath,
        kind: 'labor',
        relativePath: entry.relativePath,
        sources: [entry.relativePath],
        folder: folder(entry.relativePath),
        laborFile: entry.relativePath,
      });
    }
  } else {
    const { batch, report } = analysis;
    for (const finding of report!.findings.filter(
      (f) => f.severity !== 'info' && !f.requirementType,
    )) {
      const key = problemKey(finding, dir);
      const invoices = batch!.invoices.filter((i) => finding.invoiceNumbers.includes(i.number));
      if (invoices.length)
        for (const invoice of invoices)
          targets.push({
            id: 'invoice:' + invoice.number + ':' + key,
            label: `${invoice.sources[0]!.relativePath} · ${finding.ruleId} · ${finding.message}`,
            kind: 'invoice',
            findingKey: key,
            relativePath: invoice.sources[0]!.relativePath,
            sources: invoice.sources
              .filter(
                (s) =>
                  s.format !== 'manual' ||
                  batch!.manual.entries.some((e) => e.sourceFile === s.relativePath),
              )
              .map((s) => s.relativePath),
            invoiceNumber: invoice.number,
            folder: folder(invoice.sources[0]!.relativePath),
            groupId: finding.groupId,
          });
      else
        for (const file of finding.files) {
          const rel = relativeProblemFile(dir, file);
          if (rel.startsWith('_预检/')) continue;
          targets.push({
            id: 'file:' + rel + ':' + key,
            label: `${rel} · ${finding.ruleId} · ${finding.message}`,
            kind:
              ['parse', 'ofd'].includes(finding.ruleId) &&
              ['.pdf', '.xml', '.ofd'].includes(posix.extname(rel).toLowerCase())
                ? 'invoice'
                : 'file',
            findingKey: key,
            relativePath: rel,
            sources: [rel],
            folder: folder(rel),
            groupId: finding.groupId,
          });
        }
    }
    for (const group of report!.groups) {
      const groupFolder = relativeProblemFile(dir, group.group.dir);
      const cleanFolder = group.group.dir === dir ? '' : groupFolder;
      for (const r of group.requirements.filter((r) => r.status !== 'found')) {
        const strictLocal = r.type === 'itinerary' || r.type === 'waybill';
        const invoice = batch!.invoices.find((i) => i.number === r.invoiceNumbers[0]);
        const source =
          invoice?.sources.find((s) =>
            cleanFolder
              ? s.relativePath.startsWith(cleanFolder + '/')
              : !s.relativePath.includes('/'),
          ) ?? invoice?.sources[0];
        const finding = report!.findings.find(
          (f) =>
            f.groupId === group.group.id &&
            f.requirementType === r.type &&
            JSON.stringify([...f.invoiceNumbers].sort()) ===
              JSON.stringify([...r.invoiceNumbers].sort()),
        );
        targets.push({
          id:
            'material:' +
            group.group.id +
            ':' +
            r.type +
            ':' +
            [...r.invoiceNumbers].sort().join(','),
          label: `${group.group.name} · ${ATTACHMENT_LABELS[r.type]} · ${r.status === 'missing' ? '缺失' : '待确认'}`,
          kind: 'attachment',
          ...(finding ? { findingKey: problemKey(finding, dir) } : {}),
          attachmentType: r.type,
          folder: strictLocal && source ? folder(source.relativePath) : cleanFolder,
          groupId: group.group.id,
          invoiceNumbers: r.invoiceNumbers,
          ...(r.invoiceNumbers.length === 1 ? { invoiceNumber: r.invoiceNumbers[0] } : {}),
        });
      }
      targets.push({
        id: 'group:' + group.group.id,
        label: '新发票放入组：' + group.group.name,
        kind: 'group',
        folder: cleanFolder,
        groupId: group.group.id,
      });
    }
    if (!targets.some((t) => t.kind === 'group' && t.folder === ''))
      targets.push({
        id: 'group:根目录',
        label: '新发票放入组：根目录',
        kind: 'group',
        folder: '',
        groupId: '根目录',
      });
    for (const invoice of batch!.invoices)
      targets.push({
        id: 'invoice-file:' + invoice.number,
        label: '替换同号发票：' + invoice.sources[0]!.relativePath,
        kind: 'invoice',
        invoiceNumber: invoice.number,
        sources: invoice.sources
          .filter(
            (s) =>
              s.format !== 'manual' ||
              batch!.manual.entries.some((e) => e.sourceFile === s.relativePath),
          )
          .map((s) => s.relativePath),
        relativePath: invoice.sources[0]!.relativePath,
        folder: folder(invoice.sources[0]!.relativePath),
      });
  }
  return targets;
}
