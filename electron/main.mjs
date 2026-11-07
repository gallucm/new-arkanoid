import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'

const assetsRoot = fileURLToPath(new URL('../dist/', import.meta.url))
const pageUrl = 'arkanoid://game/index.html'
const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url))
const ranking = z
  .array(
    z.object({
      name: z.string().regex(/^[A-Z0-9 '_-]{3,8}$/),
      score: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .max(10)

let window

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'arkanoid',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

function registerAssets() {
  protocol.handle('arkanoid', async (request) => {
    const url = new URL(request.url)
    if (url.host !== 'game' || request.method !== 'GET')
      return new Response(null, { status: 404 })
    try {
      const path = resolve(assetsRoot, `.${decodeURIComponent(url.pathname)}`)
      const entry = relative(assetsRoot, path)
      if (!entry || entry.startsWith('..') || isAbsolute(entry)) {
        return new Response(null, { status: 404 })
      }
      const response = await net.fetch(pathToFileURL(path).href)
      const headers = new Headers(response.headers)
      headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      )
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

function registerRanking() {
  const path = join(app.getPath('userData'), 'ranking.v1.json')
  ipcMain.on('arkanoid:ranking', (event, action, scores) => {
    if (
      event.sender !== window?.webContents ||
      event.senderFrame !== window?.webContents.mainFrame ||
      event.senderFrame.url !== pageUrl
    ) {
      event.returnValue = { ok: false }
      return
    }

    try {
      if (action === 'read') {
        event.returnValue = { ok: true, data: readFileSync(path, 'utf8') }
      } else if (action === 'write') {
        const validated = ranking.parse(scores)
        const temporary = `${path}.tmp`
        writeFileSync(temporary, JSON.stringify(validated), { mode: 0o600 })
        renameSync(temporary, path)
        event.returnValue = { ok: true }
      } else {
        event.returnValue = { ok: false }
      }
    } catch (error) {
      if (action === 'read' && error.code === 'ENOENT') {
        event.returnValue = { ok: true, data: null }
      } else {
        event.returnValue = { ok: false }
      }
    }
  })
}

function createWindow() {
  window = new BrowserWindow({
    width: 960,
    height: 760,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      autoplayPolicy: 'no-user-gesture-required',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.on('closed', () => {
    window = undefined
  })
  void window.loadURL(pageUrl)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  void app.whenReady().then(() => {
    registerAssets()
    registerRanking()
    createWindow()
    app.on('activate', () => {
      if (!window) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
