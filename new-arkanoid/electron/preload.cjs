// Electron sandboxed preload scripts use CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('arkanoidDesktop', {
  readScores: () => ipcRenderer.sendSync('arkanoid:ranking', 'read'),
  writeScores: (scores) =>
    ipcRenderer.sendSync('arkanoid:ranking', 'write', scores),
})
