import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Document, Packer, Paragraph } from 'docx';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { config } from './helpers.js';
import { xml } from './parse-fixtures.js';
import { laborText } from './labor-fixtures.js';
import { syntheticTextPdf, syntheticPdf } from './pdf-fixture.js';
import { directoryFingerprint } from '../src/main/correction/files.js';
import type { CorrectionPreview } from '../src/core/correction/types.js';
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const word = (text: string) =>
  Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }));
function checked(value: CorrectionPreview) {
  if (value.status !== 'checked') throw new Error(value.message);
  return value;
}
async function fixture() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'single-file-service-')));
  dirs.push(temp);
  const root = join(temp, 'root');
  const batch = join(root, '20260101');
  const labor = join(root, '劳务费');
  for (const dir of [join(batch, 'PCB'), join(root, '20260102'), labor, join(root, '无法报销费用')])
    await mkdir(dir, { recursive: true });
  await writeFile(join(batch, 'PCB/文具.xml'), xml.replaceAll('电子元件', '文具'));
  await writeFile(
    join(labor, '旧说明.docx'),
    await word(laborText.replace('2026年8月1日、9月5日', '2026年8月、9月').replace('线上', '')),
  );
  const store = new DesktopStore(join(temp, 'userdata'));
  await store.saveSettings({ rules: config(), bocUrl: (await store.settings()).bocUrl });
  const service = new WorkspaceService(store);
  await service.open(root);
  return { temp, root, batch, labor, service };
}
it('劳务先模拟不写原目录，通过确认才替换；候选改动不影响已检查快照，可撤销', async () => {
  const { temp, root, labor, service } = await fixture();
  const source = join(temp, '改好.docx');
  await writeFile(source, await word(laborText));
  const target = (await service.correctionTargets(labor)).find((t) =>
    t.label.includes('没写线上还是线下'),
  )!;
  const before = await directoryFingerprint([root]);
  const preview = checked(
    await service.previewCorrection({ dir: labor, source, targetId: target.id }),
  );
  expect(preview.passed).toBe(true);
  expect(await directoryFingerprint([root])).toBe(before);
  await writeFile(source, 'changed after preview');
  const updated = await service.confirmCorrection(preview.token);
  expect(
    updated.labor![0]!.report.entries[0]!.findings.filter((f) => f.severity === 'error'),
  ).toEqual([]);
  const record = updated.labor![0]!.replacements!.records[0]!;
  expect(record.source).toBe(source);
  expect(record.archived.some((f) => f.original === '旧说明.docx')).toBe(true);
  await service.undoCorrection(labor);
  expect(
    (await service.refresh(labor)).labor![0]!.report.entries[0]!.findings.filter(
      (f) => f.ruleId === 'L1' && f.severity === 'error',
    ),
  ).toHaveLength(2);
});
it('未通过、未识别候选和过期预览均不写；拒票无服务端入口', async () => {
  const { temp, root, labor, service } = await fixture();
  const source = join(temp, '仍错.docx');
  await writeFile(source, await word(laborText.replace('2026年8月1日、9月5日', '2026年8月、9月')));
  const target = (await service.correctionTargets(labor)).find((t) =>
    t.label.includes('日期没写到'),
  )!;
  const before = await directoryFingerprint([root]);
  const failed = checked(
    await service.previewCorrection({ dir: labor, source, targetId: target.id }),
  );
  expect(failed.passed).toBe(false);
  expect(await directoryFingerprint([root])).toBe(before);
  await expect(service.confirmCorrection(failed.token)).rejects.toThrow();
  await service.cancelCorrection(failed.token);
  await expect(stat(join(labor, '_预检'))).rejects.toMatchObject({ code: 'ENOENT' });
  await writeFile(source, await word(laborText));
  const success = checked(
    await service.previewCorrection({ dir: labor, source, targetId: target.id }),
  );
  await writeFile(join(labor, '外部新增.jpg'), 'external');
  await expect(service.confirmCorrection(success.token)).rejects.toThrow(/变化|重新/);
  await service.cancelCorrection(success.token);
  await expect(service.correctionTargets(join(root, '无法报销费用'))).rejects.toThrow();
});
it('用途说明补交正确命名和找到，自动只有一项时直接匹配，撤销还原缺失', async () => {
  const { temp, batch, service } = await fixture();
  const source = join(temp, '用途说明.pdf');
  await writeFile(source, syntheticTextPdf([['合成科研用途说明', 10, 20]]));
  const preview = checked(await service.previewCorrection({ dir: batch, source }));
  expect(preview.passed).toBe(true);
  expect(preview.operations.some((op) => op.to.endsWith('PCB/用途说明-文具.pdf'))).toBe(true);
  let view = await service.confirmCorrection(preview.token);
  expect(
    view.batches
      .find((b) => b.batch.dir === batch)!
      .report.groups[0]!.requirements.find((r) => r.type === 'purposeNote')!.status,
  ).toBe('found');
  view = await service.undoCorrection(batch);
  expect(
    view.batches
      .find((b) => b.batch.dir === batch)!
      .report.groups[0]!.requirements.find((r) => r.type === 'purposeNote')!.status,
  ).toBe('missing');
});
it('同号多格式只替同格式，换号归档整组；换号仍有抬头问题不能假通过，历史查重继续生效', async () => {
  const { temp, batch, root, service } = await fixture();
  await rm(join(batch, 'PCB/文具.xml'));
  const old = xml.replace('SYNTH-001', 'SYNTH-INTEGRATION').replace('合成大学', '合成错误公司');
  await writeFile(join(batch, 'PCB/旧.xml'), old);
  await writeFile(join(batch, 'PCB/旧.pdf'), syntheticPdf());
  await service.refresh();
  const target = (await service.correctionTargets(batch)).find((t) => t.label.includes('购买方'))!;
  const source = join(temp, '改好.xml');
  await writeFile(source, old.replace('SYNTH-INTEGRATION', 'SYNTH-REOPEN'));
  let preview = checked(
    await service.previewCorrection({ dir: batch, source, targetId: target.id }),
  );
  expect(preview.passed).toBe(false);
  await service.cancelCorrection(preview.token);
  await writeFile(source, xml.replace('SYNTH-001', 'SYNTH-INTEGRATION'));
  preview = checked(await service.previewCorrection({ dir: batch, source, targetId: target.id }));
  expect(preview.passed).toBe(true);
  expect(
    preview.operations
      .filter((op) => op.kind === 'archive')
      .map((op) => op.from)
      .some((f) => f.endsWith('旧.pdf')),
  ).toBe(false);
  await service.confirmCorrection(preview.token);
  await service.undoCorrection(batch);
  await writeFile(source, xml.replace('SYNTH-001', 'SYNTH-REOPEN'));
  await service.store.mark(join(root, '20260102'), ['SYNTH-REOPEN']);
  preview = checked(await service.previewCorrection({ dir: batch, source, targetId: target.id }));
  expect(preview.passed).toBe(false);
  expect(preview.remaining.some((f) => f.ruleId === 'dup')).toBe(true);
  await service.cancelCorrection(preview.token);
  await service.store.unmark(join(root, '20260102'));
  preview = checked(await service.previewCorrection({ dir: batch, source, targetId: target.id }));
  expect(preview.passed).toBe(true);
  expect(
    preview.operations
      .filter((op) => op.kind === 'archive')
      .filter((op) => /旧\.(pdf|xml)$/.test(op.from)),
  ).toHaveLength(2);
  await service.confirmCorrection(preview.token);
});

it('同票多个解析缺项有独立目标，修好其中一项不被其他 warning 阻止', async () => {
  const { temp, batch, service } = await fixture();
  const old = xml.replace('<Quantity>2</Quantity>', '').replace('<ComTaxAm>13</ComTaxAm>', '');
  await writeFile(join(batch, 'PCB/文具.xml'), old);
  const targets = await service.correctionTargets(batch);
  const quantity = targets.find((t) => t.label.includes('第1行缺少数量'))!;
  const tax = targets.find((t) => t.label.includes('第1行缺少税额'))!;
  expect(quantity.id).not.toBe(tax.id);
  const source = join(temp, '改好.xml');
  await writeFile(source, xml.replace('<ComTaxAm>13</ComTaxAm>', ''));
  const preview = checked(
    await service.previewCorrection({ dir: batch, source, targetId: quantity.id }),
  );
  expect(preview.resolved).toBe(true);
  expect(preview.passed).toBe(true);
  expect(preview.remaining.some((f) => f.message.includes('第1行缺少税额'))).toBe(true);
  await service.cancelCorrection(preview.token);
});
it('无法解析的劳务说明也有修复目标，候选必须仍被正式识别为说明', async () => {
  const { temp, labor, service } = await fixture();
  await writeFile(join(labor, '损坏说明.docx'), 'not a zip');
  const target = (await service.correctionTargets(labor)).find(
    (t) => t.label.includes('损坏说明.docx') && t.findingKey,
  )!;
  expect(target).toBeDefined();
  expect(target.kind).toBe('labor');
  const source = join(temp, '修好说明.docx');
  await writeFile(source, await word(laborText.replace('林示例', '沈合成')));
  const preview = checked(
    await service.previewCorrection({ dir: labor, source, targetId: target.id }),
  );
  expect(preview.passed).toBe(true);
  await service.cancelCorrection(preview.token);
});

it('解析失败 XML/OFD 不能靠非发票内容消除；修复不误删旁边没有号码的手填收据', async () => {
  const { temp, batch, service } = await fixture();
  await mkdir(join(batch, '_预检'));
  const manual = {
    version: 1,
    entries: [{ group: 'AI', amount: 20, currency: 'USD', paymentDate: '2026-01-02' }],
  };
  await writeFile(join(batch, '_预检/manual.json'), JSON.stringify(manual));
  for (const extension of ['xml', 'ofd']) {
    await writeFile(
      join(batch, `PCB/坏票.${extension}`),
      extension === 'xml' ? '<EInvoice' : 'invalid zip',
    );
    const target = (await service.correctionTargets(batch)).find(
      (t) => t.relativePath === `PCB/坏票.${extension}` && t.findingKey,
    )!;
    expect(target.kind).toBe('invoice');
    const source = join(temp, '新文件.xml');
    await writeFile(source, '<root/>');
    let preview = checked(
      await service.previewCorrection({ dir: batch, source, targetId: target.id }),
    );
    expect(preview.passed).toBe(false);
    expect(preview.blockers.join()).toContain('发票');
    await service.cancelCorrection(preview.token);
    await writeFile(source, xml.replace('SYNTH-001', 'SYNTH-REPAIRED'));
    preview = checked(await service.previewCorrection({ dir: batch, source, targetId: target.id }));
    expect(preview.passed).toBe(true);
    expect(preview.operations.some((op) => op.to.endsWith('/_预检/manual.json'))).toBe(false);
    await service.cancelCorrection(preview.token);
    await rm(join(batch, `PCB/坏票.${extension}`));
  }
  expect(JSON.parse(await readFile(join(batch, '_预检/manual.json'), 'utf8'))).toEqual(manual);
});

it('手填虚拟收据可用真实发票替换，manual更新和新增原件一起撤销', async () => {
  const { temp, batch, service } = await fixture();
  await mkdir(join(batch, '_预检'));
  const manual = {
    version: 1,
    entries: [
      { group: 'PCB', amount: 20, currency: 'USD', paymentDate: '2026-01-02' },
      { group: 'AI', amount: 30, currency: 'USD', paymentDate: '2026-01-02' },
    ],
  };
  await writeFile(join(batch, '_预检/manual.json'), JSON.stringify(manual));
  const targets = await service.correctionTargets(batch);
  const target = targets.find((t) => t.kind === 'invoice' && t.invoiceNumber === 'manual:PCB:1')!;
  expect(target).toBeDefined();
  const source = join(temp, '有原件.xml');
  await writeFile(source, xml.replace('SYNTH-001', 'SYNTH-REAL'));
  const preview = checked(
    await service.previewCorrection({ dir: batch, source, targetId: target.id }),
  );
  expect(preview.passed).toBe(true);
  const view = await service.confirmCorrection(preview.token);
  const remaining = view.batches
    .find((b) => b.batch.dir === batch)!
    .batch.invoices.filter((i) => i.number.startsWith('manual:'));
  expect(remaining).toHaveLength(1);
  expect(remaining[0]!.number).toBe('manual:AI:2');
  expect(remaining[0]!.total).toBe(30);
  await service.undoCorrection(batch);
  expect(JSON.parse(await readFile(join(batch, '_预检/manual.json'), 'utf8'))).toEqual(manual);
  await expect(stat(join(batch, 'PCB/有原件.xml'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it.each([
  ['itinerary', '*交通运输服务*客运服务费', '甲电子发票.xml', '行程单-甲电子发票.pdf'],
  ['waybill', '*生产生活服务*收派服务费', '乙发票.xml', '运单明细-乙发票.pdf'],
] as const)(
  '嵌套文件夹的 %s 补交放到票所在目录并通过正式匹配',
  async (type, name, file, output) => {
    const { temp, batch, service } = await fixture();
    const nested = join(batch, '业务/某日');
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(nested, file),
      xml.replace('SYNTH-001', 'SYNTH-NESTED').replace('*电子元件*连接头', name),
    );
    const target = (await service.correctionTargets(batch)).find((t) => t.attachmentType === type)!;
    expect(target.folder).toBe('业务/某日');
    const source = join(temp, '补材料.pdf');
    await writeFile(source, syntheticTextPdf([['合成材料', 20, 30]]));
    const preview = checked(
      await service.previewCorrection({ dir: batch, source, targetId: target.id }),
    );
    expect(preview.passed).toBe(true);
    expect(preview.operations.some((op) => op.to.endsWith('业务/某日/' + output))).toBe(true);
    await service.cancelCorrection(preview.token);
  },
);
it.each(['AI/hash.png', 'hash.png', '汇率/支付记录.png'])(
  '目录内附件 %s 确认类型不复制，模拟不写、撤销删除覆盖，feedback 不变',
  async (file) => {
    const { temp, batch, service } = await fixture();
    await mkdir(join(batch, 'AI'));
    await writeFile(join(batch, 'AI/订阅说明.png'), 'synthetic subscription');
    await mkdir(join(batch, '汇率'));
    const path = join(batch, file);
    await writeFile(path, 'synthetic image');
    await writeFile(join(service.store.dir, 'feedback.json'), '[]\n');
    const target = (await service.correctionTargets(batch)).find(
      (t) => t.attachmentType === 'exchangeRate',
    )!;
    expect(target).toBeDefined();
    const before = await directoryFingerprint([batch]);
    const preview = checked(
      await service.previewCorrection({ dir: batch, source: path, targetId: target.id }),
    );
    expect(preview.passed).toBe(true);
    expect(await directoryFingerprint([batch])).toBe(before);
    expect(preview.operations.some((o) => o.kind === 'confirm-attachment')).toBe(true);
    expect(
      preview.operations.some((o) => o.kind === 'copy' && !o.to.endsWith('/_预检/manual.json')),
    ).toBe(false);
    let view = await service.confirmCorrection(preview.token);
    let b = view.batches.find((b) => b.batch.dir === batch)!;
    expect(b.batch.manual.attachments?.[file]).toBe('exchangeRate');
    expect(b.replacements!.records.at(-1)!.operation).toBe('confirm-attachment');
    expect(await readFile(path, 'utf8')).toBe('synthetic image');
    view = await service.undoCorrection(batch);
    b = view.batches.find((b) => b.batch.dir === batch)!;
    expect(b.batch.manual.attachments?.[file]).toBeUndefined();
    expect(await readFile(path, 'utf8')).toBe('synthetic image');
    expect(await readFile(join(service.store.dir, 'feedback.json'), 'utf8')).toBe('[]\n');
  },
);
it('目录内但不在查找范围的附件仍复制到正确组', async () => {
  const { batch, service } = await fixture();
  await mkdir(join(batch, 'AI'));
  await writeFile(join(batch, 'AI/订阅说明.png'), 'synthetic subscription');
  const source = join(batch, 'PCB/hash.png');
  await writeFile(source, 'synthetic');
  const target = (await service.correctionTargets(batch)).find(
    (t) => t.attachmentType === 'exchangeRate',
  )!;
  const preview = checked(
    await service.previewCorrection({ dir: batch, source, targetId: target.id }),
  );
  expect(preview.passed).toBe(true);
  expect(
    preview.operations.some((o) => o.kind === 'copy' && /AI[\/]中行汇率截图-AI\.png$/.test(o.to)),
  ).toBe(true);
  await service.cancelCorrection(preview.token);
});
it('目录内同文件夹新说明只归档旧文件，新文件不动，撤销保留新文件并还原旧文件', async () => {
  const { labor, service } = await fixture();
  const source = join(labor, '改好说明.docx');
  const good = await word(laborText);
  await writeFile(source, good);
  const target = (await service.correctionTargets(labor)).find(
    (t) => t.relativePath === '旧说明.docx' && t.label.includes('没写线上'),
  )!;
  const before = await stat(source);
  const preview = checked(
    await service.previewCorrection({ dir: labor, source, targetId: target.id }),
  );
  expect(preview.passed).toBe(true);
  expect(preview.operations.some((o) => o.kind === 'copy' && o.to.endsWith('.docx'))).toBe(false);
  const view = await service.confirmCorrection(preview.token);
  const record = view.labor!.find((l) => l.report.dir === labor)!.replacements!.records.at(-1)!;
  expect(record.archived.map((f) => f.original)).toEqual(['旧说明.docx']);
  expect(record.inserted.filter((f) => f.path.endsWith('.docx'))).toEqual([]);
  expect(await readFile(source)).toEqual(good);
  expect((await stat(source)).mtimeMs).toBe(before.mtimeMs);
  await expect(stat(join(labor, '旧说明.docx'))).rejects.toMatchObject({ code: 'ENOENT' });
  await service.undoCorrection(labor);
  expect(await readFile(source)).toEqual(good);
  expect(await readFile(join(labor, '旧说明.docx'))).toBeTruthy();
});
it('劳务目录内会议附件也确认类型不复制，并可撤销', async () => {
  const { labor, service } = await fixture();
  await writeFile(join(labor, '旧说明.docx'), await word(laborText.replace('线上', '线下会议')));
  const source = join(labor, 'hash.png');
  await writeFile(source, 'synthetic');
  const target = (await service.correctionTargets(labor)).find(
    (t) => t.laborAttachmentType === 'notice',
  )!;
  expect(target).toBeDefined();
  const preview = checked(
    await service.previewCorrection({ dir: labor, source, targetId: target.id }),
  );
  expect(preview.passed).toBe(true);
  expect(preview.operations.some((o) => o.kind === 'confirm-attachment')).toBe(true);
  const view = await service.confirmCorrection(preview.token);
  const entry = view.labor!.find((l) => l.report.dir === labor)!.report.entries[0]!;
  expect(entry.requirements.find((r) => r.type === 'notice')!.status).toBe('found');
  expect(
    JSON.parse(await readFile(join(labor, '_预检/manual.json'), 'utf8')).laborAttachments,
  ).toEqual({ 'hash.png': 'notice' });
  await service.undoCorrection(labor);
  expect(await readFile(source, 'utf8')).toBe('synthetic');
  await expect(stat(join(labor, '_预检/manual.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('确认附件保留已有手填/其他覆盖，撤销还原原索引，目录内图片清单不变', async () => {
  const { batch, service } = await fixture();
  const { readdir } = await import('node:fs/promises');
  await mkdir(join(batch, 'AI'));
  await writeFile(join(batch, 'AI/sub.png'), 'synthetic');
  await writeFile(join(batch, 'AI/hash.png'), 'synthetic');
  await mkdir(join(batch, '_预检'));
  const manual =
    JSON.stringify({ version: 1, entries: [], attachments: { 'AI/sub.png': 'subscription' } }) +
    '\n';
  await writeFile(join(batch, '_预检/manual.json'), manual);
  const before = await readdir(join(batch, 'AI'));
  const target = (await service.correctionTargets(batch)).find(
    (t) => t.attachmentType === 'exchangeRate',
  )!;
  const preview = checked(
    await service.previewCorrection({
      dir: batch,
      source: join(batch, 'AI/hash.png'),
      targetId: target.id,
    }),
  );
  expect(preview.passed).toBe(true);
  await service.confirmCorrection(preview.token);
  expect(await readdir(join(batch, 'AI'))).toEqual(before);
  expect(JSON.parse(await readFile(join(batch, '_预检/manual.json'), 'utf8')).attachments).toEqual({
    'AI/sub.png': 'subscription',
    'AI/hash.png': 'exchangeRate',
  });
  await service.undoCorrection(batch);
  expect(await readFile(join(batch, '_预检/manual.json'), 'utf8')).toBe(manual);
});
