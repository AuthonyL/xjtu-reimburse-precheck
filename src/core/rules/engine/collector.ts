import { basename } from 'node:path';
import { relativeProblemFile, requirementId, withFindingId } from '../../domain/finding-id.js';
import { attachmentLabels, requirementStatusLabels } from '../../attachments.js';
import { parseWarningCode, roundMoney } from '../../parse/common.js';
import type {
  AttachmentType,
  Batch,
  CheckedGroup,
  Finding,
  Invoice,
  Requirement,
  Severity,
} from '../../types.js';
import type { RuleConfig, RuleId } from '../config.js';
import type { RuleRegistry } from '../model.js';
import { ruleAction } from '../catalog.js';
import type { Aggregates, GroupAggregate } from './aggregate.js';
import { findMaterials } from './materials.js';

export class Collector {
  readonly findings: Finding[] = [];
  private readonly slots = new Map<CheckedGroup, Map<string, Requirement>>();
  private readonly covering = new Map<CheckedGroup, Set<Requirement>>();
  constructor(
    private readonly batch: Batch,
    private readonly config: RuleConfig,
    private readonly rules: RuleRegistry,
    private readonly aggregates: Aggregates,
  ) {}

  finding(
    ruleId: string,
    message: string,
    invoices: Invoice[] = [],
    groupId?: string,
    files?: string[],
    confirmed = false,
    options: { code?: string; severity?: Severity; requirementType?: AttachmentType } = {},
  ): void {
    const ids = ruleId.split('/').filter((id) => this.rules.get(id as RuleId)?.enabled);
    if (!ids.length) return;
    const rank = { error: 0, warning: 1, info: 2 };
    const configured = ids
      .map((id) => this.rules.get(id as RuleId)!.severity)
      .sort((a, b) => rank[a] - rank[b])[0]!;
    const targetGroup =
      this.batch.groups.find((g) => g.id === groupId) ??
      this.batch.groups.find((g) => invoices.some((i) => g.invoiceNumbers.includes(i.number)));
    const targetFiles = files ?? invoices.flatMap((i) => i.sources.map((s) => s.path));
    let code = options.code;
    if (ids.includes('parse') && code === undefined) {
      code = parseWarningCode(message);
      for (const file of [...new Set(targetFiles)].sort((a, b) => b.length - a.length))
        for (const separator of ['/', '\\'])
          code = code.replaceAll(file.replace(/[\\/]/g, separator), () =>
            relativeProblemFile(this.batch.dir, file),
          );
    }
    this.findings.push(
      withFindingId(
        {
          severity: confirmed ? 'info' : (options.severity ?? configured),
          ...(options.code || ids.includes('parse') ? { code } : {}),
          ...(options.requirementType ? { requirementType: options.requirementType } : {}),
          ruleId: ids.join('/'),
          action: ruleAction(
            ids.join('/'),
            targetGroup?.name ?? '发票所在文件夹',
            targetFiles.map((f) => basename(f)).join('、') || '相关文件',
          ),
          message,
          invoiceNumbers: invoices.map((i) => i.number),
          files: targetFiles,
          ...(targetGroup ? { groupId: targetGroup.id } : groupId ? { groupId } : {}),
        },
        this.batch.dir,
      ),
    );
  }

  require(
    checked: CheckedGroup,
    group: GroupAggregate,
    type: AttachmentType,
    ruleId: RuleId,
    reason: string,
    target: Invoice[],
    options: { aggregation?: 'sellerDay'; coversSubsets?: boolean } = {},
  ): void {
    if (!this.rules.get(ruleId)?.enabled) return;
    const first = target[0];
    const dayKey =
      first && options.aggregation === 'sellerDay' ? this.aggregates.sellerDay.get(first) : null;
    if (dayKey)
      target = group.invoices.filter(
        (i) => i.kind === 'domestic' && this.aggregates.sellerDay.get(i) === dayKey,
      );
    const numbers = target.map((i) => i.number);
    const slots = this.slots.get(checked) ?? new Map<string, Requirement>();
    this.slots.set(checked, slots);
    const key = `${type}:${numbers.join('|')}`;
    const exact = slots.get(key);
    const covered = [...(this.covering.get(checked) ?? [])].find(
      (r) => r.type === type && numbers.every((n) => r.invoiceNumbers.includes(n)),
    );
    // 两类匹配都存在时仍取最早插入的槽，与原数组 find 的顺序一致。
    const existing =
      exact && covered
        ? checked.requirements.find((r) => r === exact || r === covered)
        : (exact ?? covered);
    if (existing) {
      if (!existing.ruleIds.includes(ruleId)) existing.ruleIds.push(ruleId);
      if (!existing.reason.includes(reason)) existing.reason += `；${reason}`;
      return;
    }
    const match =
      type === 'itinerary' && first
        ? this.aggregates.travelMatches.get(first.number)!
        : findMaterials(this.batch, type, target, this.config, group.group);
    const summary =
      first && dayKey
        ? `${first.seller.name || first.seller.taxId}，${first.date}，本组${target.length}张，价税合计${roundMoney(target.reduce((sum, i) => sum + i.total, 0)).toFixed(2)}元；`
        : '';
    const requirement: Requirement = {
      id: '',
      type,
      ruleIds: [ruleId],
      reason: summary + reason,
      invoiceNumbers: numbers,
      foundFiles: match.files,
      candidateFiles: match.candidates,
      status: match.files.length ? 'found' : match.candidates.length ? 'unconfirmed' : 'missing',
      ...(match.fallback
        ? { note: '在批次根目录找到，请确认对应（含批次材料目录）' }
        : match.candidates.length
          ? { note: '同一文件夹有未命名附件，可能已有，请确认；可在 manual.json 指定附件类型' }
          : {}),
    };
    checked.requirements.push(requirement);
    slots.set(key, requirement);
    if (options.coversSubsets) {
      const covering = this.covering.get(checked) ?? new Set<Requirement>();
      covering.add(requirement);
      this.covering.set(checked, covering);
    }
  }

  finish(checked: CheckedGroup, group: GroupAggregate): void {
    for (const r of checked.requirements) {
      r.id = requirementId(r, group.group.id);
      this.finding(
        r.ruleIds.join('/'),
        `${requirementStatusLabels[r.status]}${attachmentLabels[r.type]}：${r.reason}${r.note ? `；${r.note}` : ''}`,
        group.invoices.filter((i) => r.invoiceNumbers.includes(i.number)),
        group.group.id,
        [...r.foundFiles, ...r.candidateFiles].map((a) => a.path),
        r.status === 'found',
        { code: 'attachment:' + r.type, requirementType: r.type },
      );
    }
  }
}
