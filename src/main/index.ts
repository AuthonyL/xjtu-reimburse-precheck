import { app, BrowserWindow, dialog, ipcMain, shell, session, clipboard } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { channels, type AppSettings, type BocRequest, type SidebarLayout } from '../shared/api.js';
import type { AttachmentType, ManualEntry } from '../core/types.js';
import type { LaborManualEntry } from '../core/labor/types.js';
import type { CorrectionRequest } from '../core/correction/types.js';
import { CORRECTION_EXTENSIONS } from './correction/identify.js';
import { loadConfig } from '../core/rules/config.js';
import { exportRulesConfig } from '../core/rules/export.js';
import type { ClaimState } from '../core/domain/claim.js';
import type { ClaimMeta } from './claim-store.js';
import { DesktopStore, DEFAULT_BOC_URL, validateSettings } from './store.js';
import { WorkspaceService } from './workspace.js';
import { writeJson } from './json-store.js';
import { FeedbackStore, RuleVersionStore } from './feedback-store.js';
import { FeedbackService } from './feedback-service.js';
import type { FeedbackInput, UpgradeChoices } from '../shared/feedback.js';
import { BocWindow } from './boc.js';

const here = dirname(fileURLToPath(import.meta.url));
if (process.env.PRECHECK_USER_DATA) app.setPath('userData', process.env.PRECHECK_USER_DATA);
app.setName('报销预检');
let mainWindow: BrowserWindow | null = null;
const devUrl = process.env.ELECTRON_RENDERER_URL;
const rendererUrl = pathToFileURL(join(here, '../renderer/index.html')).href;

async function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    title: '报销预检',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  mainWindow = win;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.on('closed', () => {
    mainWindow = null;
  });
  if (devUrl) await win.loadURL(devUrl);
  else await win.loadURL(rendererUrl);
}

void app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (event) => event.preventDefault());
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      const localDev =
        devUrl && ['http:', 'ws:'].includes(url.protocol) && url.host === new URL(devUrl).host;
      callback({ cancel: !['file:', 'data:', 'devtools:'].includes(url.protocol) && !localDev });
    });
    const store = new DesktopStore(app.getPath('userData'));
    const versions = new RuleVersionStore(store.dir);
    const saved = await store.settings();
    const initialized = await versions.initialize(saved.rules);
    if (JSON.stringify(initialized.rules) !== JSON.stringify(saved.rules))
      await store.saveSettings({ ...saved, rules: initialized.rules });
    const service = new WorkspaceService(store);
    const feedback = new FeedbackService(new FeedbackStore(store.dir), service, app.getVersion());
    const boc = new BocWindow(service, join(here, '../preload/boc.cjs'), (event) =>
      mainWindow?.webContents.send(channels.event, event),
    );
    function handle<T extends unknown[]>(channel: string, fn: (...args: T) => unknown) {
      ipcMain.handle(channel, async (event, ...args: T) => {
        const wc = mainWindow?.webContents;
        if (
          !wc ||
          event.sender !== wc ||
          event.senderFrame !== wc.mainFrame ||
          !(devUrl
            ? new URL(event.senderFrame.url).origin === new URL(devUrl).origin
            : event.senderFrame.url === rendererUrl)
        )
          throw new Error('IPC 来源不合法');
        return service.queue.run(async () => fn(...args));
      });
    }
    handle(channels.bootstrap, async () => {
      const restored = await service.restore();
      return {
        settings: await store.settings(),
        ruleVersion: await versions.info((await store.settings()).rules),
        recent: await store.recent(),
        userData: store.dir,
        session: await store.session(),
        restored,
      };
    });
    handle(channels.feedbackState, () => feedback.state());
    handle(channels.markFeedback, (input: FeedbackInput) => feedback.mark(input));
    handle(channels.deleteFeedback, (id: string) => feedback.remove(id));
    handle(channels.previewFeedback, (includeOriginals: boolean) =>
      feedback.prepare(includeOriginals),
    );
    handle(channels.cancelFeedback, () => feedback.cancel());
    handle(channels.exportFeedback, async (token: string) => {
      const result = process.env.PRECHECK_FEEDBACK_EXPORT
        ? { canceled: false, filePath: process.env.PRECHECK_FEEDBACK_EXPORT }
        : await dialog.showSaveDialog(mainWindow!, {
            defaultPath: `报销预检反馈-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13)}.zip`,
            filters: [{ name: '反馈包', extensions: ['zip'] }],
          });
      return result.canceled || !result.filePath ? null : feedback.save(token, result.filePath);
    });
    handle(channels.ruleVersion, async () => versions.info((await store.settings()).rules));
    handle(channels.resolveRuleUpgrade, async (choices: UpgradeChoices) => {
      const settings = await store.settings();
      const result = await versions.resolve(settings.rules, choices, (rules) =>
        store.saveSettings({ ...settings, rules }),
      );
      return result;
    });
    handle(channels.chooseFolder, async () => {
      const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] });
      return result.canceled ? null : service.open(result.filePaths[0]!);
    });
    handle(channels.openFolder, (dir: string) => service.open(dir));
    handle(channels.correctionTargets, (dir: string) => service.correctionTargets(dir));
    handle(channels.chooseCorrectionFile, async () => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        filters: [{ name: '单据文件', extensions: CORRECTION_EXTENSIONS }],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    handle(channels.previewCorrection, (request: CorrectionRequest) =>
      service.previewCorrection(request),
    );
    handle(channels.confirmCorrection, (token: string) => service.confirmCorrection(token));
    handle(channels.cancelCorrection, (token: string) => service.cancelCorrection(token));
    handle(channels.undoCorrection, (dir: string, expectedId?: string) =>
      service.undoCorrection(dir, expectedId),
    );
    handle(channels.recheck, (dir?: string) => service.refresh(dir));
    handle(channels.selectBatch, (dir: string | null) => service.select(dir));
    handle(channels.saveLayout, (layout: Partial<SidebarLayout>) => store.saveLayout(layout));
    handle(channels.confirmAttachment, (dir: string, file: string, type: AttachmentType) =>
      service.confirm(dir, file, type),
    );
    handle(channels.saveRejectedReason, (number: string, reason: string) =>
      service.saveRejectedReason(number, reason),
    );
    handle(channels.saveManual, (dir: string, entry: ManualEntry) => service.manual(dir, entry));
    handle(channels.saveLabor, (dir: string, file: string, entry: LaborManualEntry) =>
      service.saveLabor(dir, file, entry),
    );
    handle(channels.exportLabor, (dir: string, file: string, entry?: LaborManualEntry) =>
      service.exportLabor(dir, file, entry),
    );
    handle(channels.copyText, (text: string) => {
      if (typeof text !== 'string' || text.length > 100000) throw new Error('复制文本不合法或过长');
      clipboard.writeText(text);
    });
    handle(channels.exportBatch, (dir: string) => service.export(dir));
    handle(channels.markSubmitted, (dir: string, marked = true) => {
      if (typeof marked !== 'boolean') throw new Error('提交标记必须为布尔值');
      return service.mark(dir, marked);
    });
    handle(channels.transitionClaim, (dir: string, to: ClaimState, note?: string) =>
      service.transitionClaim(dir, to, note),
    );
    handle(channels.updateClaim, (dir: string, meta: ClaimMeta) => service.updateClaim(dir, meta));
    handle(channels.waiveFinding, (dir: string, id: string, reason: string) =>
      service.waiveFinding(dir, id, reason),
    );
    handle(channels.unwaiveFinding, (dir: string, id: string) => service.unwaiveFinding(dir, id));
    handle(channels.inbox, () => service.inbox());
    handle(channels.ignoreFile, (dir: string, file: string) => service.ignoreFile(dir, file));
    handle(channels.unignoreFile, (dir: string, file: string) => service.unignoreFile(dir, file));
    handle(channels.registry, () => service.registry());
    const open = async (file: string) => {
      const error = await shell.openPath(file);
      if (error) throw new Error(error);
    };
    handle(channels.openFile, async (file: string) => {
      const safe = await service.allowedFile(file);
      if (!/\.(pdf|docx|xml|ofd|xlsx|md|png|jpe?g|webp|heic|tiff?|bmp)$/i.test(safe))
        throw new Error('不支持用系统程序打开此文件类型');
      await open(safe);
    });
    handle(channels.revealFile, async (file: string) =>
      shell.showItemInFolder(await service.allowedFile(file)),
    );
    handle(channels.openOutput, async (dir: string) => open(await service.output(dir)));
    handle(channels.getSettings, () => store.settings());
    handle(channels.saveSettings, (value: AppSettings) => store.saveSettings(value));
    handle(channels.resetSettings, async () => {
      const defaults = await store.saveSettings({ bocUrl: DEFAULT_BOC_URL, rules: loadConfig() });
      await versions.acknowledge();
      return defaults;
    });
    handle(channels.importRules, async () => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        filters: [{ name: '规则 JSON', extensions: ['json'] }],
      });
      if (result.canceled) return null;
      const raw: unknown = JSON.parse(await readFile(result.filePaths[0]!, 'utf8'));
      const current = await store.settings();
      const settings =
        raw && typeof raw === 'object' && 'rules' in raw ? raw : { ...current, rules: raw };
      const saved = await store.saveSettings(settings);
      await versions.imported(result.filePaths[0]!);
      return saved;
    });
    handle(channels.exportRules, async (value: AppSettings) => {
      const settings = validateSettings(value);
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: '报销预检规则.json',
        filters: [{ name: '规则 JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return null;
      await writeJson(result.filePath, { ...settings, rules: exportRulesConfig(settings.rules) });
      return result.filePath;
    });
    handle(channels.openBoc, (request: BocRequest) => boc.open(request));
    await createWindow();
    app.on('activate', () => {
      if (!mainWindow) void createWindow();
    });
  })
  .catch((error: unknown) => {
    console.error(error);
    app.quit();
  });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
