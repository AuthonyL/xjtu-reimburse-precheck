export const BOC_SELECTION_SCRIPT = `(() => {
  if (window.__precheckSelectionInstalled) return;
  window.__precheckSelectionInstalled = true;
  const banner = document.createElement('div');
  banner.id = 'precheck-rate-banner';
  banner.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;padding:14px;background:#fff3d6;color:#371e00;border:2px solid #bd5700;z-index:2147483647;font:16px sans-serif;box-shadow:0 4px 20px #0003';
  banner.textContent = '报销预检：请选择支付日和币种、查询后点击需要的价格；验证码请自行完成。牌价按每100外币报价。';
  document.body.appendChild(banner);
  let selecting = false;
  document.addEventListener('click', async (event) => {
    const cell = event.target instanceof Element ? event.target.closest('.resTable tbody td') : null;
    if (!cell || selecting) return;
    const row = cell.parentElement;
    const index = Array.from(row.children).indexOf(cell);
    if (index < 1 || index > 5) return;
    const text = cell.textContent.trim().replace(/,/g, '');
    if (!/^\\d+(\\.\\d+)?$/.test(text) || Number(text) <= 0) return;
    const table = cell.closest('table');
    const rows = Array.from(table.rows);
    const header = table.tHead?.rows[0] || rows.find((item) => Array.from(item.cells).some((c) => c.tagName === 'TH')) || rows[0];
    const rateType = header?.cells[index]?.textContent.trim();
    const date = row.lastElementChild.textContent.trim().match(/(\\d{4})[-/](\\d{2})[-/](\\d{2})/);
    if (!date || !rateType) { banner.textContent = '无法识别结果表的日期或列名，请截图并在 APP 手填。'; return; }
    selecting = true;
    document.querySelectorAll('[data-precheck-rate]').forEach((item) => {
      item.style.outline = ''; item.style.borderRadius = ''; item.removeAttribute('data-precheck-rate');
    });
    cell.setAttribute('data-precheck-rate', 'selected');
    cell.style.outline = '4px solid #e00000';
    cell.style.outlineOffset = '-3px';
    cell.style.borderRadius = '50%';
    cell.scrollIntoView({ block: 'center' });
    banner.textContent = '正在保存红圈截图和汇率…';
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await window.bocSelection.submit({ value: Number(text), date: date[1] + '-' + date[2] + '-' + date[3],
        currencyName: row.firstElementChild.textContent.trim(), rateType });
      banner.textContent = '✓ 已保存截图和汇率，可以关闭此窗口返回 APP。';
    } catch (error) { banner.textContent = '未保存：' + error.message + '。可在 APP 手填汇率。'; }
    finally { selecting = false; }
  }, true);
})()`;
