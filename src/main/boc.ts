import { BrowserWindow, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import type { AppEvent, BocRequest, BocSelection } from '../shared/api.js';
import { validateManual } from '../core/manual.js';
import { isBocUrl } from './store.js';
import { rateFromSelection } from './boc-selection.js';
import { BOC_SELECTION_SCRIPT } from './boc-script.js';
import { saveRateCapture } from './rate-capture.js';
import { captureBocPage } from './boc-capture.js';
import type { WorkspaceService } from './workspace.js';

export class BocWindow {
  private window: BrowserWindow | null = null;
  private request: BocRequest | null = null;
  constructor(
    private service: WorkspaceService,
    private preload: string,
    private notify: (event: AppEvent) => void,
  ) {
    ipcMain.handle('boc:selected-value', async (event, raw: BocSelection) => {
      const win = this.window;
      const request = this.request;
      if (
        !win ||
        !request ||
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame ||
        !isBocUrl(event.senderFrame.url)
      )
        throw new Error('牌价窗口来源不合法');
      rateFromSelection(raw, request.entry);
      await this.service.queue.run(async () => {
        this.service.batch(request.batchDir);
        const image = await captureBocPage(win.webContents);
        const file = await saveRateCapture(request.batchDir, request.entry, raw, image.toPNG());
        this.notify({
          type: 'rates-saved',
          workspace: await this.service.refresh(request.batchDir),
          file,
        });
      });
    });
  }
  async open(request: BocRequest) {
    this.service.batch(request.batchDir);
    const entry = validateManual({ entries: [request.entry] }).entries[0]!;
    if (!entry.group || !entry.exchangeRateType)
      throw new Error('请先填写组、支付日、币种和汇率类型');
    if (!this.service.batch(request.batchDir).batch.groups.some((g) => g.name === entry.group))
      throw new Error('组不属于当前批次');
    this.window?.close();
    this.request = { batchDir: request.batchDir, entry };
    const isolated = session.fromPartition('boc-' + randomUUID());
    isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.on('will-download', (event) => event.preventDefault());
    isolated.webRequest.onBeforeRequest((details, callback) =>
      callback({
        cancel: !isBocUrl(details.url) && !details.url.startsWith('data:'),
      }),
    );
    const win = new BrowserWindow({
      width: 1120,
      height: 820,
      title: '中行历史牌价 · 点击所用价格',
      autoHideMenuBar: true,
      webPreferences: {
        session: isolated,
        preload: this.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
      },
    });
    this.window = win;
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const restrict = (event: Electron.Event, url: string) => {
      if (!isBocUrl(url)) event.preventDefault();
    };
    win.webContents.on('will-navigate', restrict);
    win.webContents.on('will-redirect', restrict);
    win.webContents.on('will-attach-webview', (event) => event.preventDefault());
    win.webContents.on('did-finish-load', () => {
      if (isBocUrl(win.webContents.getURL()))
        void win.webContents
          .executeJavaScript(BOC_SELECTION_SCRIPT)
          .catch(() =>
            this.notify({ type: 'boc-error', message: '中行页面无法注入，请自行截图并手填汇率' }),
          );
    });
    win.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3)
        this.notify({
          type: 'boc-error',
          message: `中行页面加载失败（${description}），请稍后重试或手填汇率`,
        });
    });
    win.on('closed', () => {
      if (this.window === win) {
        this.window = null;
        this.request = null;
      }
    });
    const settings = await this.service.store.settings();
    await win.loadURL(settings.bocUrl);
  }
}
