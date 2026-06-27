/**
 * Preload for the Freebuff Desktop renderer. The renderer is the existing
 * self-contained UI served by the Bun orchestrator and talks to it over local
 * HTTP/SSE, so it needs almost nothing from here. We expose a tiny read-only
 * surface for environment/version display and keep contextIsolation on.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('freebuffDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Menu → renderer tab commands ('new-tab' | 'reopen-tab' | 'close-tab').
  onMenuCommand: (handler) => {
    const listener = (_event, name) => handler(name)
    ipcRenderer.on('menu-cmd', listener)
    return () => ipcRenderer.removeListener('menu-cmd', listener)
  },
})
