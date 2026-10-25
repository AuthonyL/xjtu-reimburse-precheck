import { ipcMain, type BrowserWindow } from 'electron';
import type { SerialQueue } from './json-store.js';

export function createIpcHandler(
  queue: SerialQueue,
  window: () => BrowserWindow | null,
  devUrl: string | undefined,
  rendererUrl: string,
) {
  return function handle<T extends unknown[]>(channel: string, fn: (...args: T) => unknown) {
    ipcMain.handle(channel, async (event, ...args: T) => {
      const wc = window()?.webContents;
      if (
        !wc ||
        event.sender !== wc ||
        event.senderFrame !== wc.mainFrame ||
        !(devUrl
          ? new URL(event.senderFrame.url).origin === new URL(devUrl).origin
          : event.senderFrame.url === rendererUrl)
      )
        throw new Error('IPC 来源不合法');
      return queue.run(async () => fn(...args));
    });
  };
}
