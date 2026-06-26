/**
 * Freebuff Desktop — Electron main process (the shell side of the
 * Electron-shell + Bun-orchestrator split described in the PRD §6 and README).
 *
 * Electron's main process runs Node, not Bun. To honor "Bun main process"
 * (reuse sdk/ + agent-runtime, which export Bun-targeted TS) the shell spawns
 * the Bun orchestrator as a child process and talks to it over local HTTP/SSE
 * on 127.0.0.1. The renderer is the existing self-contained UI the Bun server
 * serves, so there is no separate renderer build step.
 *
 * Two run modes, see resolveOrchestrator():
 *   - dev: spawn a system `bun` on the TS source (src/app/server.ts).
 *   - packaged: spawn the Bun binary shipped in app resources on the pre-bundled
 *     orchestrator.js (scripts/fetch-bun.ts + scripts/build-orchestrator.ts,
 *     wired into the app via the electron-builder extraResources config). The
 *     user needs no system Bun.
 *
 *   bun --cwd freebuff-desktop run app        # launch from source (dev)
 *   FREEBUFF_TARGET_REPO=/path/to/repo bun --cwd freebuff-desktop run app
 */

const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const http = require('node:http')

const PKG_DIR = path.join(__dirname, '..')

/** @type {import('node:child_process').ChildProcess | null} */
let serverProc = null
/** @type {BrowserWindow | null} */
let mainWindow = null
let shuttingDown = false

// How to launch the orchestrator, per run mode. FREEBUFF_BUN_PATH overrides the
// bun binary in either mode (e.g. to test the dev path against a specific bun).
function resolveOrchestrator() {
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? '.exe' : ''
    const res = process.resourcesPath
    const orchDir = path.join(res, 'orchestrator')
    return {
      bun: process.env.FREEBUFF_BUN_PATH || path.join(res, 'bun', `bun${exe}`),
      args: [path.join(orchDir, 'orchestrator.js')],
      // cwd is the orchestrator dir so the bundled `import 'playwright'` resolves
      // from the node_modules shipped beside it.
      cwd: orchDir,
      uiDir: path.join(orchDir, 'ui'),
      packaged: true,
    }
  }
  return {
    bun: process.env.FREEBUFF_BUN_PATH || 'bun',
    args: [path.join(PKG_DIR, 'src', 'app', 'server.ts')],
    cwd: PKG_DIR,
    // In dev the built dist-ui/ may exist (after `ui:build`); the server falls
    // back to it. When FREEBUFF_DEV_UI is set, the Vite dev server serves the UI.
    uiDir: undefined,
    packaged: false,
  }
}

// Ask the OS for an unused loopback port so two instances never collide.
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// Poll the orchestrator's /api/state until it answers (or we give up).
function waitForServer(port, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/state', timeout: 1500 },
        (res) => {
          res.resume()
          resolve()
        },
      )
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`orchestrator did not come up within ${timeoutMs}ms`))
        } else {
          setTimeout(attempt, 300)
        }
      })
      req.on('timeout', () => req.destroy())
    }
    attempt()
  })
}

function startOrchestrator(port) {
  return new Promise((resolve, reject) => {
    const { bun, args, cwd, uiDir, packaged } = resolveOrchestrator()

    // extraResources can lose the executable bit when unpacked; restore it.
    if (packaged && process.platform !== 'win32') {
      try {
        fs.chmodSync(bun, 0o755)
      } catch {
        /* best-effort */
      }
    }

    const env = { ...process.env, PORT: String(port) }
    if (uiDir) env.FREEBUFF_UI_DIR = uiDir
    if (process.env.FREEBUFF_TARGET_REPO) {
      env.TARGET_REPO = process.env.FREEBUFF_TARGET_REPO
    }

    serverProc = spawn(bun, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    serverProc.on('error', (err) => {
      reject(
        new Error(
          `Failed to start the orchestrator with "${bun}": ${err.message}\n\n` +
            (packaged
              ? 'The bundled Bun binary could not be launched.'
              : 'Make sure Bun is installed and on PATH, or set FREEBUFF_BUN_PATH ' +
                'to the bun binary.'),
        ),
      )
    })

    serverProc.stdout.on('data', (d) => process.stdout.write(`[orchestrator] ${d}`))
    serverProc.stderr.on('data', (d) => process.stderr.write(`[orchestrator] ${d}`))

    serverProc.on('exit', (code, signal) => {
      const pid = serverProc?.pid
      serverProc = null
      if (shuttingDown) return
      const detail = signal
        ? `signal ${signal}`
        : `exit code ${code ?? 'unknown'}`
      console.error(`[orchestrator] process ${pid} ended (${detail})`)
      if (code && code !== 0) {
        dialog.showErrorBox(
          'Freebuff orchestrator stopped',
          `The orchestrator process exited unexpectedly (${detail}). ` +
            'See the terminal output for details.',
        )
      }
    })

    waitForServer(port).then(resolve, reject)
  })
}

function stopOrchestrator() {
  shuttingDown = true
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM')
    // Hard-stop if it ignores the polite request.
    const proc = serverProc
    setTimeout(() => {
      if (proc && !proc.killed) proc.kill('SIGKILL')
    }, 3000)
  }
}

function loadingPage() {
  // Inline splash shown while the orchestrator boots. Matches the UI's dark +
  // freebuff-lime palette so the transition isn't jarring.
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;flex-direction:column;
    gap:18px;background:#0c0d0f;color:#e6e6e6;
    font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .dot{width:42px;height:42px;border-radius:50%;
    border:3px solid #1f2937;border-top-color:#7cff3f;animation:spin 0.9s linear infinite}
  .msg{color:#9ca3af}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
  <div class="dot"></div>
  <div class="msg">Starting Freebuff orchestrator…</div>
</body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c0d0f',
    title: 'Freebuff Desktop',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(loadingPage())

  // Open target=_blank / external links in the system browser, not a new
  // Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

// Forward a tab command to the renderer, which owns tab state. The renderer also
// handles these via keydown; in Electron the menu accelerator consumes the keys so
// only this IPC path fires (no double-action).
function sendMenuCommand(name) {
  mainWindow?.webContents.send('menu-cmd', name)
}

function buildMenu(reloadApp) {
  const isMac = process.platform === 'darwin'
  // Custom File/Window menus (no default Cmd+W "Close Window" binding) so Cmd+W
  // closes the active TAB, not the window.
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => sendMenuCommand('new-tab') },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => sendMenuCommand('reopen-tab'),
        },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => sendMenuCommand('close-tab') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Reload App', accelerator: 'CmdOrCtrl+R', click: () => reloadApp() },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function boot() {
  const win = createWindow()
  let appUrl
  try {
    // Dev-UI mode: Vite serves the renderer on 5174 and proxies /api to the Bun
    // orchestrator pinned to 8787. Otherwise the Bun server serves the built SPA.
    const devUi = !!process.env.FREEBUFF_DEV_UI
    const port = devUi ? 8787 : await findFreePort()
    await startOrchestrator(port)
    appUrl = devUi ? 'http://127.0.0.1:5174/' : `http://127.0.0.1:${port}/`
    await win.loadURL(appUrl)
  } catch (err) {
    dialog.showErrorBox('Freebuff Desktop failed to start', String(err?.message ?? err))
    app.quit()
    return
  }
  buildMenu(() => mainWindow?.loadURL(appUrl))
}

// Single-instance lock — a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(boot)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) boot()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', stopOrchestrator)
  app.on('will-quit', stopOrchestrator)
}
