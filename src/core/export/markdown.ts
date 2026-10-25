import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Report, Requirement, RequirementCounts } from '../types.js';
import { attachmentLabels, requirementStatusLabels } from '../attachments.js';

const countText = (counts: RequirementCounts): string =>
  `需要${counts.total} / 已找到${counts.found} / 待确认${counts.unconfirmed} / 缺失${counts.missing}`;

const escape = (s: string): string => s.replace(/[|\r\n]/g, ' ');
function renderRequirement(requirement: Requirement): string {
  const parts = [
    `- ${requirementStatusLabels[requirement.status]}：${attachmentLabels[requirement.type]}`,
    `（${requirement.ruleIds.join('/')}；${requirement.invoiceNumbers.map(escape).join('、') || '本组'}）。`,
    escape(requirement.reason),
  ];
  if (requirement.foundFiles.length) {
    parts.push(`；文件：${requirement.foundFiles.map((a) => escape(a.relativePath)).join('、')}`);
  }
  if (requirement.candidateFiles.length) {
    parts.push(
      `；候选文件：${requirement.candidateFiles.map((a) => escape(a.relativePath)).join('、')}`,
    );
  }
  if (requirement.note) parts.push(`；${requirement.note}`);
  return parts.join('');
}
export function renderMarkdown(report: Report): string {
  const lines = [
    `# ${escape(report.batchId)} 报销预检`,
    '',
    `发票张数：${report.invoiceCount}；人民币已知金额合计：${report.totalCny.toFixed(2)} 元。`,
    '',
  ];
  lines.push(`材料要求：${countText(report.requirementCounts)}。`, '');
  if (report.unconverted.length || report.incompleteGroups.length)
    lines.push('存在未折算或待手填金额，以上不是完整可报销总额。', '');
  for (const g of report.groups) {
    const flags = Object.entries(g.group.flags)
      .filter(([, v]) => v)
      .map(
        ([k]) =>
          ({
            deferred: '暂缓，不计入合计',
            bankTransfer: '公转',
            outsourced: '委托业务',
            ai: 'AI订阅',
          })[k],
      );
    lines.push(
      `## ${escape(g.group.name)}`,
      '',
      `标记：${flags.join('、') || '普通'}；支出内容：${escape(g.expenseContent)}；已知人民币金额：${g.totalCny.toFixed(2)} 元。`,
      '',
      '| 发票号码 | 销售方 | 币种 | 价税合计 | 人民币 | 支出内容 |',
      '| --- | --- | --- | ---: | ---: | --- |',
    );
    for (const i of g.invoices)
      lines.push(
        `| ${escape(i.invoice.number)} | ${escape(i.invoice.seller.name)} | ${i.invoice.currency} | ${i.invoice.total.toFixed(2)} | ${i.cnyAmount === null ? '待折算' : i.cnyAmount.toFixed(2)} | ${escape(i.expenseContent)} |`,
      );
    lines.push('', `材料检查：${countText(g.requirementCounts)}。`, '');
    if (!g.requirements.length) lines.push('- 未触发材料要求。');
    for (const r of g.requirements) lines.push(renderRequirement(r));
    lines.push('');
  }
  lines.push('## 按支出内容合计', '', '| 支出内容 | 人民币金额 |', '| --- | ---: |');
  for (const t of report.totals)
    lines.push(`| ${escape(t.expenseContent)} | ${t.amount.toFixed(2)} |`);
  lines.push('', '## 未折算票据', '');
  for (const i of report.unconverted)
    lines.push(
      `- ${escape(i.invoice.number)}：${i.invoice.currency} ${i.invoice.total.toFixed(2)}，待填汇率。`,
    );
  for (const id of report.incompleteGroups)
    lines.push(`- ${escape(id)}：待手填金额、支付日期和汇率。`);
  lines.push('', '## 暂缓组', '');
  for (const g of report.deferredGroups)
    lines.push(
      `- ${escape(g.group.name)}：${g.invoices.length} 张，已知人民币 ${g.totalCny.toFixed(2)} 元，不计入合计。`,
    );
  lines.push('', '## 检查提示', '');
  for (const f of report.findings.filter((f) => f.resolution !== 'waived'))
    lines.push(
      `- [${f.severity}] ${f.ruleId} ${escape(f.message)}；怎么处理：${escape(f.action)}${f.invoiceNumbers.length ? `（${f.invoiceNumbers.map(escape).join('、')}）` : ''}`,
    );
  const waived = report.findings.filter((f) => f.resolution === 'waived');
  if (waived.length) {
    lines.push('', '## 已豁免问题', '');
    for (const finding of waived)
      lines.push(
        `- ${escape(finding.ruleIds.join('/'))} ${escape(finding.message)}；理由：${escape(report.waivers?.find((w) => w.findingId === finding.id)?.reason ?? '未记录理由')}`,
      );
  }
  return lines.join('\n') + '\n';
}
export async function exportMarkdown(report: Report, targetDir: string): Promise<string> {
  await mkdir(targetDir, { recursive: true });
  const path = join(targetDir, '汇总.md');
  await writeFile(path, renderMarkdown(report), 'utf8');
  return path;
}
