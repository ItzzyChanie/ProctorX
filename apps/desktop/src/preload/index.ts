import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('proctorX', {
  startLockdown: (policy: { mode: 'BLACKLIST' | 'WHITELIST'; list: string[] }) =>
    ipcRenderer.invoke('lockdown:start', policy),
  stopLockdown: () => ipcRenderer.invoke('lockdown:stop'),
  onViolation: (callback: (apps: string[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, apps: string[]) => callback(apps)
    ipcRenderer.on('lockdown:violation', listener)
    return () => ipcRenderer.removeListener('lockdown:violation', listener)
  },
  onFocusLost: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('lockdown:focus-lost', listener)
    return () => ipcRenderer.removeListener('lockdown:focus-lost', listener)
  },
})