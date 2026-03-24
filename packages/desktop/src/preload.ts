import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('catCafe', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke('config:save', cfg),
  startApp: () => ipcRenderer.invoke('config:start-app'),
});
