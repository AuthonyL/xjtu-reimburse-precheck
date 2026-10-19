import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { channels, type DesktopApi, type AppEvent } from '../shared/api.js';

const api: DesktopApi = {
  feedbackState: () => ipcRenderer.invoke(channels.feedbackState),
  markFeedback: (input) => ipcRenderer.invoke(channels.markFeedback, input),
  deleteFeedback: (id) => ipcRenderer.invoke(channels.deleteFeedback, id),
  previewFeedback: (includeOriginals) =>
    ipcRenderer.invoke(channels.previewFeedback, includeOriginals),
  exportFeedback: (token) => ipcRenderer.invoke(channels.exportFeedback, token),
  cancelFeedback: () => ipcRenderer.invoke(channels.cancelFeedback),
  ruleVersion: () => ipcRenderer.invoke(channels.ruleVersion),
  resolveRuleUpgrade: (choices) => ipcRenderer.invoke(channels.resolveRuleUpgrade, choices),
  correctionTargets: (dir) => ipcRenderer.invoke(channels.correctionTargets, dir),
  chooseCorrectionFile: () => ipcRenderer.invoke(channels.chooseCorrectionFile),
  droppedFilePath: (file) => webUtils.getPathForFile(file),
  previewCorrection: (request) => ipcRenderer.invoke(channels.previewCorrection, request),
  confirmCorrection: (token) => ipcRenderer.invoke(channels.confirmCorrection, token),
  cancelCorrection: (token) => ipcRenderer.invoke(channels.cancelCorrection, token),
  undoCorrection: (dir, expectedId) => ipcRenderer.invoke(channels.undoCorrection, dir, expectedId),
  bootstrap: () => ipcRenderer.invoke(channels.bootstrap),
  chooseFolder: () => ipcRenderer.invoke(channels.chooseFolder),
  openFolder: (dir) => ipcRenderer.invoke(channels.openFolder, dir),
  droppedFolder: (file) => ipcRenderer.invoke(channels.openFolder, webUtils.getPathForFile(file)),
  recheck: (dir) => ipcRenderer.invoke(channels.recheck, dir),
  selectBatch: (dir) => ipcRenderer.invoke(channels.selectBatch, dir),
  saveLayout: (layout) => ipcRenderer.invoke(channels.saveLayout, layout),
  confirmAttachment: (dir, file, type) =>
    ipcRenderer.invoke(channels.confirmAttachment, dir, file, type),
  saveRejectedReason: (number, reason) =>
    ipcRenderer.invoke(channels.saveRejectedReason, number, reason),
  saveManual: (dir, entry) => ipcRenderer.invoke(channels.saveManual, dir, entry),
  saveLabor: (dir, file, entry) => ipcRenderer.invoke(channels.saveLabor, dir, file, entry),
  exportLabor: (dir, file, entry) => ipcRenderer.invoke(channels.exportLabor, dir, file, entry),
  copyText: (text) => ipcRenderer.invoke(channels.copyText, text),
  exportBatch: (dir) => ipcRenderer.invoke(channels.exportBatch, dir),
  openFile: (file) => ipcRenderer.invoke(channels.openFile, file),
  revealFile: (file) => ipcRenderer.invoke(channels.revealFile, file),
  openOutput: (dir) => ipcRenderer.invoke(channels.openOutput, dir),
  markSubmitted: (dir, marked) => ipcRenderer.invoke(channels.markSubmitted, dir, marked),
  getSettings: () => ipcRenderer.invoke(channels.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(channels.saveSettings, settings),
  resetSettings: () => ipcRenderer.invoke(channels.resetSettings),
  importRules: () => ipcRenderer.invoke(channels.importRules),
  exportRules: (settings) => ipcRenderer.invoke(channels.exportRules, settings),
  openBoc: (request) => ipcRenderer.invoke(channels.openBoc, request),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: AppEvent) => listener(value);
    ipcRenderer.on(channels.event, handler);
    return () => {
      ipcRenderer.removeListener(channels.event, handler);
    };
  },
};
contextBridge.exposeInMainWorld('precheck', Object.freeze(api));
