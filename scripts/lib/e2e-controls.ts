import type { ElectronApplication, Locator, Page } from 'playwright/test';
export const openSection = async (container: Locator, title: string) => {
  const button = container.getByRole('button', { name: new RegExp('^' + title) });
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
};
export const openRule = async (page: Locator, id: string) => {
  const button = page
    .getByTestId('rule-' + id)
    .getByRole('button', { name: new RegExp('^' + id + ' ·') });
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
};

export function correctionControls(application: ElectronApplication, page: Page) {
  const chooseSource = async (file: string) =>
    application.evaluate(({ ipcMain }, selected) => {
      const state = globalThis as typeof globalThis & {
        correctionPicker?: { file: string; calls: number };
      };
      state.correctionPicker ??= { file: selected, calls: 0 };
      state.correctionPicker.file = selected;
      ipcMain.removeHandler('app:choose-correction-file');
      ipcMain.handle('app:choose-correction-file', () => {
        state.correctionPicker!.calls++;
        return state.correctionPicker!.file;
      });
    }, file);
  const pickerCalls = () =>
    application.evaluate(
      () =>
        (globalThis as typeof globalThis & { correctionPicker?: { calls: number } })
          .correctionPicker?.calls ?? 0,
    );
  const dropSource = async (target: Locator, file: string) => {
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.dataset.e2eSource = 'true';
      input.hidden = true;
      document.body.append(input);
    });
    await page.locator('input[data-e2e-source]').setInputFiles(file);
    await target.evaluate((element) => {
      const input = document.querySelector<HTMLInputElement>('input[data-e2e-source]')!;
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(input.files![0]!);
      element.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }),
      );
      element.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }),
      );
      input.remove();
    });
  };
  return { chooseSource, pickerCalls, dropSource };
}

export const changeClaimState = async (page: Page, label: string) => {
  await page.getByRole('button', { name: /^状态：/ }).click();
  await page.getByRole('menuitem', { name: '标记为' + label, exact: true }).click();
};
export const moreAction = async (page: Page, label: string) => {
  const more = page.getByRole('button', { name: '更多', exact: true });
  if (await more.count()) {
    await more.click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
  } else await page.getByRole('button', { name: label, exact: true }).click();
};
