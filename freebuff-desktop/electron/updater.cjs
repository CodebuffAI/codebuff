/**
 * Freebuff Desktop — in-app updater (main-process side).
 *
 * WHY NOT electron-updater / Squirrel? The release workflow still publishes no
 * `latest*.yml` update metadata, so electron-updater can't drive this yet (mac
 * builds ARE Developer ID signed + notarized now, so that side of the blocker
 * is gone). Instead we hand-roll a cross-platform "download the installer and
 * swap it in" flow:
 *
 *   - Windows: run the NSIS `.exe`; it replaces the install and relaunches.
 *   - Linux:   overwrite the running `$APPIMAGE` with the new one and re-exec.
 *   - macOS:   mount the `.dmg` and swap the `.app` bundle into place. The new
 *              bundle is signed + notarized with a stapled ticket, so Gatekeeper
 *              clears it silently on relaunch (no quarantine strip needed).
 *
 * Each platform's swap runs in a detached shell that first waits for THIS
 * process to exit (so we never overwrite a running bundle/binary), then
 * relaunches the new version. When code signing lands, this can be replaced
 * with electron-updater's quitAndInstall.
 *
 * Release resolution mirrors the web `/api/desktop/download` route (PR #409):
 * the community repo also hosts frequent CLI releases and the cross-repo desktop
 * tags share one created_at, so the release-LIST sort buries the desktop
 * release. We read the git matching-refs API for `freebuff-desktop-v*` tags,
 * pick the highest semver, then fetch that one release for its assets.
 *
 * The pure helpers (compareSemver / pickLatestVersion / pickAssetUrl /
 * buildInstallPlan / macAppBundlePath) take no electron dependency and are
 * unit-tested in updater.test.ts; electron + node child_process are require()'d
 * lazily inside init() so the test can import this file.
 */

const RELEASE_REPO = 'CodebuffAI/codebuff-community'
const TAG_PREFIX = 'freebuff-desktop-v'
// Re-check this often after the first (post-boot) check.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h
// Delay the first check so it never competes with orchestrator boot.
const FIRST_CHECK_DELAY_MS = 12 * 1000
// How often the "install when idle" watcher polls the orchestrator.
const IDLE_POLL_MS = 15 * 1000

// ---------------------------------------------------------------------------
// Pure helpers (no electron) — unit-tested.
// ---------------------------------------------------------------------------

/** Parse "1.2.3" → [1,2,3], or null if it isn't a clean 3-part numeric version. */
function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Compare two "x.y.z" versions. Returns -1 (a<b), 0 (equal), 1 (a>b).
 *  Unparseable versions sort as lowest. */
function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** True when `latest` is a strictly higher semver than `current`. */
function isNewer(current, latest) {
  return compareSemver(current, latest) < 0
}

/**
 * Given the matching-refs payload (array of { ref } like
 * "refs/tags/freebuff-desktop-v0.0.3"), return the highest semver version
 * string (e.g. "0.0.3"), or null if none parse.
 */
function pickLatestVersion(refs, prefix = TAG_PREFIX) {
  let best = null
  for (const entry of refs || []) {
    const ref = typeof entry === 'string' ? entry : entry && entry.ref
    if (!ref) continue
    const tag = ref.replace(/^refs\/tags\//, '')
    if (!tag.startsWith(prefix)) continue
    const version = tag.slice(prefix.length)
    if (!parseSemver(version)) continue
    if (best === null || compareSemver(version, best) > 0) best = version
  }
  return best
}

/**
 * Pick the installer asset download URL for this platform/arch from a release's
 * `assets` array. Matches on filename tokens rather than exact names so a future
 * arch-token rename (electron-builder writes linux AppImages as `x86_64`, not
 * `x64`) doesn't silently break resolution.
 */
function pickAssetUrl(assets, platform, arch) {
  const list = (assets || []).filter((a) => a && a.name && a.browser_download_url)
  const by = (pred) => {
    const hit = list.find((a) => pred(a.name.toLowerCase()))
    return hit ? hit.browser_download_url : null
  }
  if (platform === 'darwin') {
    // Prefer the exact arch (mac-arm64 / mac-x64); fall back to any dmg.
    return (
      by((n) => n.includes(`mac-${arch}`) && n.endsWith('.dmg')) ||
      by((n) => n.includes('mac') && n.endsWith('.dmg')) ||
      by((n) => n.endsWith('.dmg'))
    )
  }
  if (platform === 'win32') {
    return by((n) => n.includes('win') && n.endsWith('.exe')) || by((n) => n.endsWith('.exe'))
  }
  if (platform === 'linux') {
    return by((n) => n.endsWith('.appimage'))
  }
  return null
}

/** Single-quote a string for safe interpolation into a /bin/sh command. */
function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

/**
 * Derive the .app bundle root from the running executable path:
 *   /Applications/Freebuff.app/Contents/MacOS/Freebuff → /Applications/Freebuff.app
 * Returns null when execPath isn't inside a .app (e.g. `electron .` in dev), in
 * which case there's nothing to swap and we fall back to opening the installer.
 */
function macAppBundlePath(execPath, sep = '/') {
  const marker = `${sep}Contents${sep}MacOS${sep}`
  const i = String(execPath).indexOf(marker)
  return i === -1 ? null : execPath.slice(0, i)
}

/**
 * Build the detached process that swaps in `installerPath` and relaunches, WITHOUT
 * executing it. Returns { command, args, detached } or null when the platform's
 * self-update prerequisites are missing (not a .app on mac, no $APPIMAGE on linux)
 * — the caller then falls back to opening the installer manually. Pure/testable.
 *
 * @param {object} p
 * @param {NodeJS.Platform} p.platform
 * @param {string} p.installerPath  the downloaded installer (.dmg/.exe/.AppImage)
 * @param {string} p.execPath       process.execPath (used to locate the mac bundle)
 * @param {string} [p.appImagePath] process.env.APPIMAGE (linux only)
 * @param {number} p.pid            process.pid — the swap waits for this to exit
 */
function buildInstallPlan({ platform, installerPath, execPath, appImagePath, pid }) {
  const waitForExit = `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done`

  if (platform === 'win32') {
    // The NSIS installer replaces the app and (runAfterFinish, default) relaunches.
    return { command: installerPath, args: [], detached: true }
  }

  if (platform === 'linux') {
    if (!appImagePath) return null
    const script = [
      waitForExit,
      `chmod +x ${shQuote(installerPath)}`,
      `mv -f ${shQuote(installerPath)} ${shQuote(appImagePath)}`,
      `chmod +x ${shQuote(appImagePath)}`,
      `(${shQuote(appImagePath)} >/dev/null 2>&1 &)`,
    ].join('\n')
    return { command: '/bin/sh', args: ['-c', script], detached: true }
  }

  if (platform === 'darwin') {
    const bundle = macAppBundlePath(execPath)
    if (!bundle) return null
    const stage = `${bundle}.update-new`
    const backup = `${bundle}.update-old`
    // Stage a full copy off to the side first, so a failure while copying the
    // (large) bundle leaves the installed app untouched. The swap itself is two
    // local renames with rollback: if the second `mv` fails we restore the
    // backup. The only unsafe window is a hard kill *between* the two renames
    // (bundle already moved to .update-old, new one not yet in place) — a
    // sub-millisecond same-directory-rename gap with no boot-time recovery.
    const script = [
      waitForExit,
      `MNT=$(mktemp -d)`,
      `hdiutil attach -nobrowse -mountpoint "$MNT" ${shQuote(installerPath)} || exit 1`,
      `SRC=$(ls -d "$MNT"/*.app | head -n1)`,
      `rm -rf ${shQuote(stage)} ${shQuote(backup)}`,
      `if ! ditto "$SRC" ${shQuote(stage)}; then hdiutil detach "$MNT" -quiet; exit 1; fi`,
      `hdiutil detach "$MNT" -quiet`,
      `if ! mv ${shQuote(bundle)} ${shQuote(backup)}; then rm -rf ${shQuote(stage)}; exit 1; fi`,
      `if mv ${shQuote(stage)} ${shQuote(bundle)}; then rm -rf ${shQuote(backup)}; else mv ${shQuote(backup)} ${shQuote(bundle)}; exit 1; fi`,
      // No quarantine strip needed: the swapped-in bundle is Developer ID signed
      // and notarized with a stapled ticket, so Gatekeeper clears it silently
      // (offline) on relaunch even with com.apple.quarantine set.
      `open ${shQuote(bundle)}`,
    ].join('\n')
    return { command: '/bin/sh', args: ['-c', script], detached: true }
  }

  return null
}

// ---------------------------------------------------------------------------
// Network (electron-dependent — uses global fetch, available in Electron main).
// ---------------------------------------------------------------------------

async function ghJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'freebuff-desktop-updater',
    },
  })
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
  return res.json()
}

/**
 * Resolve the latest published desktop release.
 * Returns { version, assetUrl, htmlUrl } or null (no release found). Throws on
 * network/HTTP failure so callers can tell "up to date" from "couldn't check".
 */
async function fetchLatestRelease(platform, arch) {
  const refs = await ghJson(
    `https://api.github.com/repos/${RELEASE_REPO}/git/matching-refs/tags/${TAG_PREFIX}`,
  )
  const version = pickLatestVersion(refs)
  if (!version) return null
  const release = await ghJson(
    `https://api.github.com/repos/${RELEASE_REPO}/releases/tags/${TAG_PREFIX}${version}`,
  )
  return {
    version,
    assetUrl: pickAssetUrl(release.assets, platform, arch),
    htmlUrl:
      release.html_url ||
      `https://github.com/${RELEASE_REPO}/releases/tag/${TAG_PREFIX}${version}`,
  }
}

/** Ask the orchestrator whether any tabs are still working. Returns
 *  { busy, running, queued } or null when it can't be reached. */
async function fetchActivity(base) {
  if (!base) return null
  const res = await fetch(`${base}api/activity`, {
    headers: { 'User-Agent': 'freebuff-desktop-updater' },
  })
  if (!res.ok) throw new Error(`activity ${res.status}`)
  return res.json()
}

/**
 * Did we receive the whole file? `total === 0` means the server advertised no
 * content-length, so we can't verify and must accept. Otherwise the byte counts
 * must match — a short read means the connection closed mid-download and the
 * installer on disk is truncated. Pure/testable.
 */
function isCompleteDownload(received, total) {
  return total === 0 || received === total
}

/** Stream a URL to `dest`, reporting fractional progress (0..1) when the server
 *  sends a content-length. Follows redirects (GitHub → S3) via fetch defaults.
 *  Throws (and removes the partial file) on network error or a truncated body,
 *  so a corrupt installer is never handed to the platform swap. */
async function downloadFile(url, dest, onProgress) {
  const res = await fetch(url, { headers: { 'User-Agent': 'freebuff-desktop-updater' } })
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
  const fs = require('node:fs')
  const { Readable } = require('node:stream')
  const total = Number(res.headers.get('content-length')) || 0
  const out = fs.createWriteStream(dest)
  const stream = Readable.fromWeb(res.body)
  let received = 0
  stream.on('data', (chunk) => {
    received += chunk.length
    if (total && onProgress) onProgress(received / total)
  })
  const discard = () => {
    try {
      out.destroy()
      fs.rmSync(dest, { force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
  try {
    await new Promise((resolve, reject) => {
      stream.on('error', reject)
      out.on('error', reject)
      out.on('finish', resolve)
      stream.pipe(out)
    })
  } catch (err) {
    discard()
    throw err
  }
  if (!isCompleteDownload(received, total)) {
    discard()
    throw new Error(`download incomplete: got ${received} of ${total} bytes`)
  }
  return dest
}

// ---------------------------------------------------------------------------
// Persisted state (userData/update-state.json) so "Skip This Version" sticks.
// ---------------------------------------------------------------------------

function loadState(app, fs, path) {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'update-state.json'), 'utf8'))
  } catch {
    return {}
  }
}
function saveState(app, fs, path, state) {
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'update-state.json'), JSON.stringify(state))
  } catch {
    /* best-effort — a failed write just means we may re-prompt */
  }
}

// ---------------------------------------------------------------------------
// Orchestration.
// ---------------------------------------------------------------------------

let started = false
let installing = false
let idleTimer = null

/**
 * Wire up automatic + on-demand update checks.
 *
 * @param {object} deps
 * @param {string} deps.currentVersion   running app version (app.getVersion()).
 * @param {boolean} deps.isPackaged      skip auto-checks in dev (menu check still works).
 * @param {() => import('electron').BrowserWindow | null} deps.getWindow  dialog parent + progress bar.
 * @param {() => string | null} deps.getActivityBase  orchestrator base URL (e.g. "http://127.0.0.1:PORT/").
 * @returns {{ checkNow: (opts?: {interactive?: boolean}) => Promise<void> }}
 */
function init({ currentVersion, isPackaged, getWindow, getActivityBase }) {
  const electron = require('electron')
  const { app, dialog, shell, Notification } = electron
  const { spawn } = require('node:child_process')
  const fs = require('node:fs')
  const path = require('node:path')
  const platform = process.platform
  const arch = process.arch

  function setProgress(fraction) {
    try {
      getWindow()?.setProgressBar(fraction)
    } catch {
      /* window gone — ignore */
    }
  }

  // Electron's dialog API wants a BrowserWindow or the arg omitted — passing a
  // literal `null` (the window is closed, common on macOS) is rejected. Coerce
  // to undefined so the dialog just opens parentless instead of throwing.
  const dialogParent = () => getWindow() ?? undefined

  function notify(title, body) {
    try {
      if (Notification && Notification.isSupported()) new Notification({ title, body }).show()
    } catch {
      /* best-effort */
    }
  }

  // Download the installer and swap it in, then quit so the detached swap script
  // (which waits for us to exit) can relaunch the new version. On any failure,
  // offer a manual browser download instead.
  async function runInstall(latest) {
    if (installing) return
    installing = true
    if (idleTimer) {
      clearInterval(idleTimer)
      idleTimer = null
    }
    const url = latest.assetUrl
    try {
      if (!url) {
        // No installer asset for this platform — send them to the release page.
        shell.openExternal(latest.htmlUrl)
        installing = false
        return
      }
      const dest = path.join(app.getPath('temp'), path.basename(new URL(url).pathname))
      await downloadFile(url, dest, setProgress)
      setProgress(-1)

      const plan = buildInstallPlan({
        platform,
        installerPath: dest,
        execPath: process.execPath,
        appImagePath: process.env.APPIMAGE,
        pid: process.pid,
      })
      if (!plan) {
        // Can't self-swap here (dev / non-.app / no $APPIMAGE): open the installer.
        shell.openPath(dest)
        installing = false
        return
      }

      spawn(plan.command, plan.args, { detached: true, stdio: 'ignore' }).unref()
      // Let the swap script take over; quitting frees the app bundle/binary.
      setImmediate(() => app.quit())
    } catch (err) {
      setProgress(-1)
      installing = false
      console.error('[updater] install failed:', err && err.message)
      const { response } = await dialog.showMessageBox(dialogParent(), {
        type: 'error',
        message: 'Update failed to install',
        detail: `${(err && err.message) || err}\n\nYou can download it manually instead.`,
        buttons: ['Download in Browser', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      })
      if (response === 0) shell.openExternal(url || latest.htmlUrl)
    }
  }

  // Poll the orchestrator until no tabs are working, then install.
  function armIdleInstall(latest) {
    notify('Update scheduled', `Freebuff ${latest.version} will install once all tabs are idle.`)
    const tick = async () => {
      if (installing) return
      let activity
      try {
        activity = await fetchActivity(getActivityBase())
      } catch {
        return // orchestrator busy/unreachable — try again next tick
      }
      if (activity && activity.busy === false) {
        if (idleTimer) {
          clearInterval(idleTimer)
          idleTimer = null
        }
        await runInstall(latest)
      }
    }
    if (idleTimer) clearInterval(idleTimer)
    idleTimer = setInterval(() => void tick(), IDLE_POLL_MS)
    idleTimer.unref?.()
    void tick() // install right away if already idle
  }

  async function checkNow({ interactive = false } = {}) {
    if (installing) return
    let latest
    try {
      latest = await fetchLatestRelease(platform, arch)
    } catch (err) {
      console.error('[updater] check failed:', err && err.message)
      if (interactive) {
        await dialog.showMessageBox(dialogParent(), {
          type: 'warning',
          message: 'Could not check for updates',
          detail: 'Please try again later or download from freebuff.com/desktop.',
          buttons: ['OK'],
        })
      }
      return
    }

    if (!latest || !isNewer(currentVersion, latest.version)) {
      if (interactive) {
        await dialog.showMessageBox(dialogParent(), {
          type: 'info',
          message: "You're up to date",
          detail: `Freebuff ${currentVersion} is the latest version.`,
          buttons: ['OK'],
        })
      }
      return
    }

    // Auto-checks respect a persisted "skip this version"; the menu item ignores it.
    if (!interactive) {
      const state = loadState(app, fs, path)
      if (state.skippedVersion && compareSemver(state.skippedVersion, latest.version) >= 0) return
    }

    const buttons = ['Install', 'Install When Idle', 'Skip This Version', 'Remind Me Later']
    const { response } = await dialog.showMessageBox(dialogParent(), {
      type: 'info',
      message: `Freebuff ${latest.version} is available`,
      detail:
        `You're running ${currentVersion}.\n\n` +
        '• Install — download and restart now.\n' +
        '• Install When Idle — update automatically once all tabs finish working.',
      buttons,
      defaultId: 0,
      cancelId: 3,
    })
    if (response === 0) await runInstall(latest)
    else if (response === 1) armIdleInstall(latest)
    else if (response === 2) saveState(app, fs, path, { skippedVersion: latest.version })
  }

  // Automatic checks only for the packaged app; in dev there's nothing to update to.
  if (isPackaged && !process.env.FREEBUFF_DISABLE_UPDATE_CHECK && !started) {
    started = true
    setTimeout(() => void checkNow(), FIRST_CHECK_DELAY_MS)
    setInterval(() => void checkNow(), CHECK_INTERVAL_MS).unref?.()
  }

  return { checkNow }
}

module.exports = {
  init,
  // Exported for unit tests.
  compareSemver,
  isNewer,
  parseSemver,
  pickLatestVersion,
  pickAssetUrl,
  buildInstallPlan,
  macAppBundlePath,
  shQuote,
  isCompleteDownload,
  fetchLatestRelease,
  TAG_PREFIX,
  RELEASE_REPO,
}
