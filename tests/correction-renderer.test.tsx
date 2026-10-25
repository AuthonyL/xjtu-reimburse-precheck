// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen, within, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { mkdtemp, realpath, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Document, Packer, Paragraph } from 'docx';
import { App } from '../src/renderer/src/App.js';
import { WorkspaceService } from '../src/main/workspace.js';
import { DesktopStore } from '../src/main/store.js';
import { laborText } from './labor-fixtures.js';
import { directoryFingerprint } from '../src/main/correction/files.js';

it('真实服务串联：不自动选文件、通过直接放入、toast撤销、失败过滤、反馈不变', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'correction-renderer-')));
  try {
    const root = join(temp, 'root');
    const labor = join(root, '劳务费');
    await mkdir(labor, { recursive: true });
    const doc = (text: string) =>
      Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }));
    await writeFile(
      join(labor, '旧说明.docx'),
      await doc(laborText.replace('2026年8月1日、9月5日', '2026年8月、9月').replace('线上', '')),
    );
    const good = join(temp, '改好说明.docx');
    const bad = join(temp, '仍错说明.docx');
    await writeFile(good, await doc(laborText));
    await writeFile(bad, await doc(laborText.replace('2026年8月1日、9月5日', '2026年8月、9月')));
    const store = new DesktopStore(join(temp, 'userdata'));
    const service = new WorkspaceService(store);
    const view = await service.open(root);
    await service.select(labor);
    let source = good;
    const choose = vi.fn(async () => source);
    await writeFile(join(store.dir, 'feedback.json'), '[]\n');
    Object.assign(window, {
      precheck: {
        bootstrap: async () => ({
          settings: await store.settings(),
          recent: [],
          userData: store.dir,
          session: await store.session(),
          restored: { workspace: view, message: null },
        }),
        onEvent: () => () => {},
        recheck: service.refresh.bind(service),
        selectBatch: service.select.bind(service),
        saveLayout: store.saveLayout.bind(store),
        correctionTargets: service.correctionTargets.bind(service),
        chooseCorrectionFile: choose,
        droppedFilePath: () => source,
        previewCorrection: service.previewCorrection.bind(service),
        confirmCorrection: service.confirmCorrection.bind(service),
        cancelCorrection: service.cancelCorrection.bind(service),
        undoCorrection: service.undoCorrection.bind(service),
      },
    });
    const user = userEvent.setup();
    const rendered = render(<App />);
    await screen.findByTestId('labor-entry');
    const issue = Array.from(rendered.container.querySelectorAll<HTMLElement>('.finding')).find(
      (e) => e.textContent?.includes('没写线上还是线下'),
    )!;
    await user.click(within(issue).getByRole('button', { name: /没写线上还是线下/ }));
    await user.click(within(issue).getByRole('button', { name: '放入改好的文件' }));
    const dialog = await screen.findByRole('dialog');
    expect(choose).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '或从文件夹选择…' }));
    expect(choose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('labor-entry').querySelectorAll('.finding.error')).toHaveLength(0);
    const toast = await screen.findByTestId('correction-toast');
    expect(toast.textContent).toContain('问题已解决');
    await user.click(within(toast).getByRole('button', { name: '查看详情' }));
    const details = screen.getByRole('dialog');
    expect(details.textContent).toContain('旧说明.docx');
    await user.click(within(details).getByRole('button', { name: '关闭' }));
    await user.click(screen.getByRole('button', { name: /^输出文件/ }));
    const history = screen.getByTestId('replacement-history');
    expect(history.textContent).toContain('旧说明.docx');
    await user.click(within(toast).getByRole('button', { name: '撤销' }));
    await waitFor(() =>
      expect(screen.getByTestId('labor-entry').querySelectorAll('.finding.error')).toHaveLength(2),
    );
    source = bad;
    const before = await directoryFingerprint([root]);
    const dates = Array.from(rendered.container.querySelectorAll<HTMLElement>('.finding')).find(
      (e) => e.textContent?.includes('日期没写到'),
    )!;
    await user.click(within(dates).getByRole('button', { name: /日期没写到/ }));
    await user.click(within(dates).getByRole('button', { name: '放入改好的文件' }));
    const failed = await screen.findByRole('dialog');
    await user.click(within(failed).getByRole('button', { name: '或从文件夹选择…' }));
    await within(failed).findByText('未通过');
    expect(failed.textContent).not.toContain('没写线上还是线下');
    expect(within(failed).queryByRole('button', { name: '确认放入' })).toBeNull();
    await user.click(within(failed).getByRole('button', { name: '关闭' }));
    expect(await directoryFingerprint([root])).toBe(before);
    source = good;
    await user.click(screen.getByRole('button', { name: '检查单个文件' }));
    const global = await screen.findByRole('dialog');
    expect(within(global).getByRole('combobox', { name: '要解决哪条问题' })).toBeTruthy();
    expect(choose).toHaveBeenCalledTimes(2);
    await user.click(within(global).getByRole('button', { name: '取消' }));
    const trigger = screen.getByRole<HTMLButtonElement>('button', { name: '检查单个文件' });
    await waitFor(() => expect(trigger.closest('fieldset')?.disabled).toBe(false));
    fireEvent.dragOver(rendered.container.querySelector('[class*="_app_"]')!, {
      dataTransfer: { files: [] },
    });
    expect(rendered.container.querySelector('[class*="_dropOverlay_"]')).toBeTruthy();
    const closed = rendered.container.querySelector<HTMLButtonElement>(
      '[class*="_findingSummary_"][aria-expanded="false"]',
    )!;
    expect(closed).toBeTruthy();
    fireEvent.drop(closed, {
      dataTransfer: { files: [new File(['synthetic'], '改好说明.docx')] },
    });
    await screen.findByTestId('correction-toast');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rendered.container.querySelector('[class*="_dropOverlay_"]')).toBeNull();
    expect(choose).toHaveBeenCalledTimes(2);
    expect(await readFile(join(labor, '旧说明.docx'))).toBeTruthy();
    expect(await readFile(join(store.dir, 'feedback.json'), 'utf8')).toBe('[]\n');
  } finally {
    cleanup();
    await rm(temp, { recursive: true, force: true });
  }
}, 15000);
