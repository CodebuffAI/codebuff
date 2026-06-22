/**
 * Freebuff Desktop — Electron main process (the shell side of the
 * Electron-shell + Bun-orchestrator split described in the PRD §6 and README).
 *
 * Electron's main process runs Node, not Bun. To honor "Bun main process"
 * (reuse sdk/ + agent-runtime, which export Bun-targeted TS) the shell spawns
 * `bun src/app/server.ts` as a child orchestrator process and talks to it over
 * local HTTP/SSE on 127.0.0.1. The renderer is the existing self-contained UI
 * the Bun server serves, so there is no separate build step.
 *
 *   bun --cwd freebuff-desktop run app        # launch the desktop app
 *   FREEBUFF_TARGET_REPO=/path/to/repo bun --cwd freebuff-desktop run app
 */

const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const net = require('node:net')
const http = require('node:http')

const PKG_DIR = path.join(__dirname, '..')
const SERVER_ENTRY = path.join(PKG_DIR, 'src', 'app', 'server.ts')

/** @type {import('node:child_process').ChildProcess | null} */
let serverProc = null
/** @type {BrowserWindow | null} */
let mainWindow = null
let shuttingDown = false

// The bun binary that runs the orchestrator. Resolved from PATH by default;
// override with FREEBUFF_BUN_PATH if bun lives somewhere non-standard.
function resolveBun() {
  return process.env.FREEBUFF_BUN_PATH || 'bun'
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
    const bun = resolveBun()
    const env = { ...process.env, PORT: String(port) }
    if (process.env.FREEBUFF_TARGET_REPO) {
      env.TARGET_REPO = process.env.FREEBUFF_TARGET_REPO
    }

    serverProc = spawn(bun, [SERVER_ENTRY], {
      cwd: PKG_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    serverProc.on('error', (err) => {
      // Almost always "bun: command not found".
      reject(
        new Error(
          `Failed to start the orchestrator with "${bun}": ${err.message}\n\n` +
            'Make sure Bun is installed and on PATH, or set FREEBUFF_BUN_PATH ' +
            'to the bun binary.',
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

function buildMenu(reloadApp) {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload App',
          accelerator: 'CmdOrCtrl+R',
          click: () => reloadApp(),
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function boot() {
  const win = createWindow()
  let appUrl
  try {
    const port = await findFreePort()
    await startOrchestrator(port)
    appUrl = `http://127.0.0.1:${port}/`
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
