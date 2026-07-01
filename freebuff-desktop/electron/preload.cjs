/**
 * Preload for the Freebuff renderer. The renderer is the existing
 * self-contained UI served by the Bun orchestrator and talks to it over local
 * HTTP/SSE, so it needs almost nothing from here. We expose a tiny read-only
 * surface for environment/version display and keep contextIsolation on.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron')

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
  // Resolve a dropped File to its absolute path. Electron 32+ removed File.path,
  // so the composer's drag-and-drop relies on this. Returns '' for non-file blobs.
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  // Native open dialog for the paperclip button — files AND folders, multi-select.
  // Resolves to [{ path, name, isDirectory }] (the main process stats each pick).
  pickAttachments: () => ipcRenderer.invoke('dialog:pickAttachments'),
  // Native folder chooser for the project picker. Resolves to the chosen
  // absolute path, or null when the user cancels.
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  // Write pasted image bytes (a screenshot has no path) to a temp file so it can be
  // attached like any other file. Resolves to { path, name } or null on failure.
  saveClipboardImage: (bytes, ext) => ipcRenderer.invoke('clipboard:saveImage', { bytes, ext }),
})
