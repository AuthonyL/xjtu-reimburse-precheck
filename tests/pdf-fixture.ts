/** 完全合成的最小 PDF，独立构造 ToUnicode 映射以验证 Node 文字提取。 */
export function syntheticPdf(isInvoice = true): Buffer {
  const texts: [string, number, number][] = [
    [isInvoice ? '电子发票（普通发票）' : '合成附件资料', 100, 20],
    ['发票号码：SYNTH-INTEGRATION', 370, 20],
    ['开票日期：2026年01月02日', 370, 40],
    ['名称：合成大学', 30, 70],
    ['名称：合成公司', 330, 70],
    ['统一社会信用代码/纳税人识别号：SYNTHBUYER00000001', 30, 95],
    ['统一社会信用代码/纳税人识别号：SYNTHSELLER0000001', 330, 95],
    ...['项目名称', '规格型号', '单位', '数量', '单价', '金额', '税率/征收率', '税额'].map(
      (v, n) => [v, [20, 140, 230, 280, 340, 420, 490, 560][n]!, 120] as [string, number, number],
    ),
    ...['*电子元件*合成器件', 'Model A', '个', '2', '50.00', '100.00', '13%', '13.00'].map(
      (v, n) => [v, [20, 140, 230, 280, 340, 420, 490, 560][n]!, 140] as [string, number, number],
    ),
    ['合计', 20, 180],
    ['价税合计（小写）¥113.00', 20, 200],
  ];
  return syntheticTextPdf(texts);
}
export function syntheticTextPdf(texts: [string, number, number][]): Buffer {
  const chars = [...new Set(texts.flatMap(([s]) => [...s]))];
  const ids = new Map(chars.map((c, n) => [c, n + 1]));
  const hex = (v: number) => v.toString(16).padStart(4, '0');
  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Synthetic def
/CMapType 2 def
1 begincodespacerange
<0000> <ffff>
endcodespacerange
${chars.length} beginbfchar
${chars.map((c) => `<${hex(ids.get(c)!)}> <${hex(c.charCodeAt(0))}>`).join('\n')}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end end`;
  const content = texts
    .map(
      ([s, x, y]) =>
        `BT /F1 10 Tf 1 0 0 1 ${x} ${400 - y} Tm <${[...s].map((c) => hex(ids.get(c)!)).join('')}> Tj ET`,
    )
    .join('\n');
  const stream = (s: string) => `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 640 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    stream(content),
    stream(cmap),
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Synthetic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 500 >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /Synthetic /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 5 0 R >>',
    '<< /Type /FontDescriptor /FontName /Synthetic /Flags 4 /FontBBox [0 -200 1000 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>',
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  for (const [n, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${n + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, '0')} 00000 n `)
    .join(
      '\n',
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
