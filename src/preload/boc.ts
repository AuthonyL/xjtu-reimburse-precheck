import { contextBridge, ipcRenderer } from 'electron';
import type { BocSelection } from '../shared/api.js';

contextBridge.exposeInMainWorld(
  'bocSelection',
  Object.freeze({
    submit: (value: BocSelection) =>
      ipcRenderer.invoke('boc:selected-value', value) as Promise<void>,
  }),
);
