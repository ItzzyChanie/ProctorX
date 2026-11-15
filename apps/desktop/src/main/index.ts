import { app, BrowserWindow, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { normalize, prohibitedApps, sanitizePolicy, type Policy } from './lockdown-policy'

const execute = promisify(execFile)
let mainWindow: BrowserWindow | null = null
let policy: Policy | null = null
let inspectionTimer: NodeJS.Timeout | null = null

async function visibleApplications() {
  if (process.platform === 'win32') {
    const { stdout } = await execute('powershell.exe', [
      '-NoProfile',
      '-Command',
      "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty ProcessName",
    ])
    return stdout.split(/\r?\n/u).map(normalize).filter(Boolean)
  }
  if (process.platform === 'darwin') {
    const { stdout } = await execute('osascript', [
      '-e',
      'tell application "System Events" to get name of every application process whose visible is true',
    ])
    return stdout.split(',').map(normalize).filter(Boolean)
  }
  throw new Error('Lockdown is supported only on Windows and macOS')
}

async function inspectApplications() {
  if (!policy || !mainWindow) return
  try {
    const prohibited = prohibitedApps(await visibleApplications(), policy)
    mainWindow.webContents.send('lockdown:violation', prohibited)
    if (prohibited.length) {
      mainWindow.show()
      mainWindow.focus()
    }
  } catch (error) {
    mainWindow.webContents.send('lockdown:error', String(error))
  }
}

function stopLockdown() {
  policy = null
  if (inspectionTimer) clearInterval(inspectionTimer)
  inspectionTimer = null
  mainWindow?.setAlwaysOnTop(false)
  mainWindow?.setKiosk(false)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  const webUrl = process.env.PROCTORX_WEB_URL ?? 'http://127.0.0.1:5173'
  void mainWindow.loadURL(webUrl)
  mainWindow.on('blur', () => {
    if (policy) mainWindow?.webContents.send('lockdown:focus-lost')
  })
}

ipcMain.handle('lockdown:start', async (_event, nextPolicy: unknown) => {
  if (!['win32', 'darwin'].includes(process.platform))
    throw new Error('Lockdown is supported only on Windows and macOS')
  // A missing or malformed policy must never flag every open window.
  policy = sanitizePolicy(nextPolicy)
  if (!policy) return { platform: process.platform, inspecting: false }
  mainWindow?.setKiosk(true)
  mainWindow?.setAlwaysOnTop(true, 'screen-saver')
  if (inspectionTimer) clearInterval(inspectionTimer)
  inspectionTimer = setInterval(() => void inspectApplications(), 2_500)
  await inspectApplications()
  return { platform: process.platform }
})
ipcMain.handle('lockdown:stop', () => stopLockdown())

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})