import { ipcMain, app, BrowserWindow } from "electron";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const execute = promisify(execFile);
let mainWindow = null;
let policy = null;
let inspectionTimer = null;
const normalize = (name) => name.trim().toLowerCase().replace(/\.exe$/u, "").replace(/\.app$/u, "");
async function visibleApplications() {
  if (process.platform === "win32") {
    const { stdout } = await execute("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty ProcessName"
    ]);
    return stdout.split(/\r?\n/u).map(normalize).filter(Boolean);
  }
  if (process.platform === "darwin") {
    const { stdout } = await execute("osascript", [
      "-e",
      'tell application "System Events" to get name of every application process whose visible is true'
    ]);
    return stdout.split(",").map(normalize).filter(Boolean);
  }
  throw new Error("Lockdown is supported only on Windows and macOS");
}
function prohibitedApps(openApps, activePolicy) {
  const configured = activePolicy.list.map(normalize).filter(Boolean);
  const shellAllowList = ["proctorx", "electron", "finder", "dock", "windowserver", "explorer"];
  return openApps.filter((openApp) => {
    if (shellAllowList.some((allowed) => openApp.includes(allowed))) return false;
    const configuredMatch = configured.some(
      (entry) => openApp.includes(entry) || entry.includes(openApp)
    );
    return activePolicy.mode === "BLACKLIST" ? configuredMatch : !configuredMatch;
  });
}
async function inspectApplications() {
  if (!policy || !mainWindow) return;
  try {
    const prohibited = prohibitedApps(await visibleApplications(), policy);
    mainWindow.webContents.send("lockdown:violation", prohibited);
    if (prohibited.length) {
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (error) {
    mainWindow.webContents.send("lockdown:error", String(error));
  }
}
function stopLockdown() {
  policy = null;
  if (inspectionTimer) clearInterval(inspectionTimer);
  inspectionTimer = null;
  mainWindow?.setAlwaysOnTop(false);
  mainWindow?.setKiosk(false);
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true
    }
  });
  const webUrl = process.env.PROCTORX_WEB_URL ?? "http://127.0.0.1:5173";
  void mainWindow.loadURL(webUrl);
  mainWindow.on("blur", () => {
    if (policy) mainWindow?.webContents.send("lockdown:focus-lost");
  });
}
ipcMain.handle("lockdown:start", async (_event, nextPolicy) => {
  if (!["win32", "darwin"].includes(process.platform))
    throw new Error("Lockdown is supported only on Windows and macOS");
  policy = nextPolicy;
  mainWindow?.setKiosk(true);
  mainWindow?.setAlwaysOnTop(true, "screen-saver");
  if (inspectionTimer) clearInterval(inspectionTimer);
  inspectionTimer = setInterval(() => void inspectApplications(), 2500);
  await inspectApplications();
  return { platform: process.platform };
});
ipcMain.handle("lockdown:stop", () => stopLockdown());
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
