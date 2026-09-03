import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("proctorX", {
  startLockdown: (policy) => ipcRenderer.invoke("lockdown:start", policy),
  stopLockdown: () => ipcRenderer.invoke("lockdown:stop"),
  onViolation: (callback) => {
    const listener = (_event, apps) => callback(apps);
    ipcRenderer.on("lockdown:violation", listener);
    return () => ipcRenderer.removeListener("lockdown:violation", listener);
  },
  onFocusLost: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("lockdown:focus-lost", listener);
    return () => ipcRenderer.removeListener("lockdown:focus-lost", listener);
  }
});
