#!/usr/bin/env node

const { spawn, execFileSync } = require('child_process')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const { pipeline } = require('stream/promises')
const zlib = require('zlib')

const tar = require('tar')
const { createReleaseHttpClient } = require('./http')

const packageName = 'freebuff'

/**
 * Terminal escape sequences to reset terminal state after the child process exits.
 * When the binary is SIGKILL'd, it can't clean up its own terminal state.
 * The wrapper (this process) survives and must reset these modes.
 */
const EXIT_ALTERNATE_SCREEN_SEQUENCE = '\x1b[?1049l'
const SAFE_TERMINAL_RESET_SEQUENCES =
  '\x1b[?1000l' + // Disable X10 mouse mode
  '\x1b[?1002l' + // Disable button event mouse mode
  '\x1b[?1003l' + // Disable any-event mouse mode (all motion)
  '\x1b[?1006l' + // Disable SGR extended mouse mode
  '\x1b[?1004l' + // Disable focus reporting
  '\x1b[?2004l' + // Disable bracketed paste mode
  '\x1b[<u' + // Pop kitty keyboard protocol flags
  '\x1b[>4;0m' + // Reset modifyOtherKeys
  '\x1b[?25h' // Show cursor

const FULL_TERMINAL_RESET_SEQUENCES =
  EXIT_ALTERNATE_SCREEN_SEQUENCE + SAFE_TERMINAL_RESET_SEQUENCES

function resetTerminal(options = {}) {
  const { exitAlternateScreen = false } = options

  try {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false)
    }
  } catch {
    // stdin may be closed
  }
  try {
    if (process.stdout.isTTY) {
      // Exiting the alternate screen is only safe after an interactive child.
      // Plain CLI paths like --help never enter it, and ?1049l can erase output.
      process.stdout.write(
        exitAlternateScreen
          ? FULL_TERMINAL_RESET_SEQUENCES
          : SAFE_TERMINAL_RESET_SEQUENCES,
      )
    }
  } catch {
    // stdout may be closed
  }
}

function getUnsignedExitCode(code) {
  return code != null && code < 0 ? (code >>> 0) : code
}

function isWindowsNativeCrashCode(code) {
  const unsignedCode = getUnsignedExitCode(code)
  return (
    process.platform === 'win32' &&
    (unsignedCode === 0xC000001D ||
      unsignedCode === 0xC0000005 ||
      unsignedCode === 0xC0000409)
  )
}

function shouldExitAlternateScreen(code, signal) {
  return Boolean(signal) || isWindowsNativeCrashCode(code)
}

function isIllegalInstructionExit(code, signal) {
  const unsignedCode = getUnsignedExitCode(code)
  return (
    signal === 'SIGILL' ||
    (process.platform === 'win32' && unsignedCode === 0xC000001D)
  )
}

function createConfig(packageName) {
  const homeDir = os.homedir()
  const configDir = path.join(homeDir, '.config', 'manicode')
  const binaryName =
    process.platform === 'win32' ? `${packageName}.exe` : packageName

  return {
    homeDir,
    configDir,
    binaryName,
    binaryPath: path.join(configDir, binaryName),
    metadataPath: path.join(configDir, 'freebuff-metadata.json'),
    tempDownloadDir: path.join(configDir, '.freebuff-download-temp'),
    userAgent: `${packageName}-cli`,
    requestTimeout: 20000,
    downloadRequestTimeout: 120000,
    downloadMaxAttempts: 3,
  }
}

const CONFIG = createConfig(packageName)
const { downloadFile, httpGet, withRetries } = createReleaseHttpClient({
  env: process.env,
  userAgent: CONFIG.userAgent,
  requestTimeout: CONFIG.requestTimeout,
})

function getPostHogConfig() {
  const apiKey =
    process.env.CODEBUFF_POSTHOG_API_KEY ||
    process.env.NEXT_PUBLIC_POSTHOG_API_KEY
  const host =
    process.env.CODEBUFF_POSTHOG_HOST ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST_URL

  if (!apiKey || !host) {
    return null
  }

  return { apiKey, host }
}

/**
 * Track update failure event to PostHog.
 * Fire-and-forget - errors are silently ignored.
 */
function trackUpdateFailed(errorMessage, version, context = {}) {
  try {
    const posthogConfig = getPostHogConfig()
    if (!posthogConfig) {
      return
    }

    const payload = JSON.stringify({
      api_key: posthogConfig.apiKey,
      event: 'cli.update_freebuff_failed',
      properties: {
        distinct_id: `anonymous-${CONFIG.homeDir}`,
        error: errorMessage,
        version: version || 'unknown',
        platform: process.platform,
        arch: process.arch,
        ...context,
      },
      timestamp: new Date().toISOString(),
    })

    const parsedUrl = new URL(`${posthogConfig.host}/capture/`)
    const isHttps = parsedUrl.protocol === 'https:'
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }

    const transport = isHttps ? https : http
    const req = transport.request(options)
    req.on('error', () => {})
    req.write(payload)
    req.end()
  } catch (e) {
    // Silently ignore any tracking errors
  }
}

const PLATFORM_TARGETS = {
  'linux-x64': `${packageName}-linux-x64.tar.gz`,
  'linux-x64-baseline': `${packageName}-linux-x64-baseline.tar.gz`,
  'linux-arm64': `${packageName}-linux-arm64.tar.gz`,
  'darwin-x64': `${packageName}-darwin-x64.tar.gz`,
  'darwin-arm64': `${packageName}-darwin-arm64.tar.gz`,
  'win32-x64': `${packageName}-win32-x64.tar.gz`,
  'win32-x64-baseline': `${packageName}-win32-x64-baseline.tar.gz`,
}

const BASELINE_FALLBACK_TARGETS = {
  'linux-x64': 'linux-x64-baseline',
  'win32-x64': 'win32-x64-baseline',
}

const term = {
  clearLine: () => {
    if (process.stderr.isTTY) {
      process.stderr.write('\r\x1b[K')
    }
  },
  write: (text) => {
    term.clearLine()
    process.stderr.write(text)
  },
  writeLine: (text) => {
    term.clearLine()
    process.stderr.write(text + '\n')
  },
}

function getPlatformKey() {
  return `${process.platform}-${process.arch}`
}

function getTargetOverride() {
  const envNames = [
    `${packageName.toUpperCase()}_BINARY_TARGET`,
    'CODEBUFF_BINARY_TARGET',
    'CLI_BINARY_TARGET',
  ]

  for (const envName of envNames) {
    const target = process.env[envName]
    if (target && PLATFORM_TARGETS[target]) {
      return target
    }
  }

  return null
}

function linuxCpuHasAvx2() {
  try {
    return /\bavx2\b/i.test(fs.readFileSync('/proc/cpuinfo', 'utf8'))
  } catch {
    return true
  }
}

// Returns true (AVX2 present), false (absent), or null (couldn't determine).
// Ask the OS directly via IsProcessorFeaturePresent (kernel32), which is
// backed by CPUID — far more reliable than matching CPU model names, and it
// works on the stock Windows PowerShell that ships with every supported
// Windows version. Feature 40 = PF_AVX2_INSTRUCTIONS_AVAILABLE.
function probeWindowsAvx2() {
  const script =
    "$f = Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")] " +
    "public static extern bool IsProcessorFeaturePresent(uint feature);' " +
    "-Name Cpu -Namespace Win32 -PassThru; $f::IsProcessorFeaturePresent(40)"
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (out === 'True') return true
    if (out === 'False') return false
    return null
  } catch {
    // No PowerShell, locked-down policy, timeout, etc. — inconclusive.
    return null
  }
}

let _hasAvx2Cache

function machineHasAvx2() {
  if (_hasAvx2Cache === undefined) {
    _hasAvx2Cache = detectMachineHasAvx2()
  }
  return _hasAvx2Cache
}

function detectMachineHasAvx2() {
  if (process.arch !== 'x64') {
    return true
  }

  // Linux detection is a cheap file read, so we don't bother persisting it.
  if (process.platform === 'linux') {
    return linuxCpuHasAvx2()
  }

  if (process.platform !== 'win32') {
    return true
  }

  // Windows detection shells out to PowerShell. getDefaultTargetKey runs on
  // every launch (via the version check), so cache the result on disk to keep
  // startup fast after the first probe.
  const cached = readCachedAvx2()
  if (cached !== null) {
    return cached
  }
  const detected = probeWindowsAvx2()
  if (detected === null) {
    // Inconclusive probe: assume AVX2 for this launch and rely on the SIGILL
    // fallback, but don't persist it — a transient failure must not lock in a
    // wrong answer for the lifetime of the install. We'll re-probe next launch.
    return true
  }
  writeCachedAvx2(detected)
  return detected
}

function getCpuFeatureCachePath() {
  return path.join(CONFIG.configDir, 'cpu-features.json')
}

function readCachedAvx2() {
  try {
    const cache = JSON.parse(fs.readFileSync(getCpuFeatureCachePath(), 'utf8'))
    return typeof cache.avx2 === 'boolean' ? cache.avx2 : null
  } catch {
    return null
  }
}

function writeCachedAvx2(value) {
  try {
    fs.mkdirSync(CONFIG.configDir, { recursive: true })
    fs.writeFileSync(getCpuFeatureCachePath(), JSON.stringify({ avx2: value }))
  } catch {
    // Best effort; we'll just re-probe next launch.
  }
}

function getDefaultTargetKey() {
  const override = getTargetOverride()
  if (override) {
    return override
  }

  const platformKey = getPlatformKey()
  // Select the binary up front from explicit CPU feature detection rather than
  // optimistically launching the AVX2 build and waiting for it to crash with
  // an illegal instruction. The crash isn't always a clean immediate failure —
  // it can surface later from a deeper code path — so older CPUs (e.g. an
  // Intel Xeon with AVX but no AVX2) are safer on baseline from the start.
  //
  // This assumes every baseline target is gated on AVX2 specifically, which
  // holds today (only linux-x64 and win32-x64 have baseline builds, both
  // AVX2-gated). If a baseline build is ever added for a different reason, give
  // BASELINE_FALLBACK_TARGETS a per-target capability and check that instead.
  if (BASELINE_FALLBACK_TARGETS[platformKey] && !machineHasAvx2()) {
    return BASELINE_FALLBACK_TARGETS[platformKey]
  }

  return platformKey
}

function getBaselineFallbackTargetKey() {
  // Runtime safety net: if proactive detection was unavailable or wrong and the
  // optimized binary still dies with SIGILL, fall back to baseline.
  return BASELINE_FALLBACK_TARGETS[getPlatformKey()] || null
}

function isTargetAllowedForThisMachine(target) {
  const override = getTargetOverride()
  if (override) {
    return target === override
  }
  // Check the baseline fallback first: it's always safe on its platform and
  // avoids running CPU detection when a baseline binary is already installed.
  return (
    target === getBaselineFallbackTargetKey() ||
    target === getDefaultTargetKey()
  )
}

function getDownloadTargetKey() {
  const override = getTargetOverride()
  if (override) {
    return override
  }

  const metadata = getCurrentMetadata()
  if (metadata?.target && isTargetAllowedForThisMachine(metadata.target)) {
    return metadata.target
  }

  return getDefaultTargetKey()
}

async function getLatestVersion() {
  try {
    const res = await httpGet(
      `https://registry.npmjs.org/${packageName}/latest`,
    )

    if (res.statusCode !== 200) return null

    const body = await streamToString(res)
    const packageData = JSON.parse(body)

    return packageData.version || null
  } catch (error) {
    return null
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    let data = ''
    stream.on('data', (chunk) => (data += chunk))
    stream.on('end', () => resolve(data))
    stream.on('error', reject)
  })
}

function getCurrentVersion() {
  try {
    const metadata = getCurrentMetadata()
    if (!metadata) {
      return null
    }
    if (!fs.existsSync(CONFIG.binaryPath)) {
      return null
    }
    const metadataTarget = metadata.target || getPlatformKey()
    if (!isTargetAllowedForThisMachine(metadataTarget)) {
      return null
    }
    return metadata.version || null
  } catch (error) {
    return null
  }
}

function getCurrentMetadata() {
  try {
    if (!fs.existsSync(CONFIG.metadataPath)) {
      return null
    }
    return JSON.parse(fs.readFileSync(CONFIG.metadataPath, 'utf8'))
  } catch {
    return null
  }
}

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0

  if (!v1.match(/^\d+(\.\d+)*$/)) {
    return -1
  }

  const parseVersion = (version) => {
    const parts = version.split('-')
    const mainParts = parts[0].split('.').map(Number)
    const prereleaseParts = parts[1] ? parts[1].split('.') : []
    return { main: mainParts, prerelease: prereleaseParts }
  }

  const p1 = parseVersion(v1)
  const p2 = parseVersion(v2)

  for (let i = 0; i < Math.max(p1.main.length, p2.main.length); i++) {
    const n1 = p1.main[i] || 0
    const n2 = p2.main[i] || 0

    if (n1 < n2) return -1
    if (n1 > n2) return 1
  }

  if (p1.prerelease.length === 0 && p2.prerelease.length === 0) {
    return 0
  } else if (p1.prerelease.length === 0) {
    return 1
  } else if (p2.prerelease.length === 0) {
    return -1
  } else {
    for (
      let i = 0;
      i < Math.max(p1.prerelease.length, p2.prerelease.length);
      i++
    ) {
      const pr1 = p1.prerelease[i] || ''
      const pr2 = p2.prerelease[i] || ''

      const isNum1 = !isNaN(parseInt(pr1))
      const isNum2 = !isNaN(parseInt(pr2))

      if (isNum1 && isNum2) {
        const num1 = parseInt(pr1)
        const num2 = parseInt(pr2)
        if (num1 < num2) return -1
        if (num1 > num2) return 1
      } else if (isNum1 && !isNum2) {
        return 1
      } else if (!isNum1 && isNum2) {
        return -1
      } else if (pr1 < pr2) {
        return -1
      } else if (pr1 > pr2) {
        return 1
      }
    }
    return 0
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function createProgressBar(percentage, width = 30) {
  const filled = Math.round((width * percentage) / 100)
  const empty = width - filled
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']'
}

function isRetryableDownloadError(error) {
  if (error && typeof error.retryable === 'boolean') return error.retryable
  return !['EACCES', 'ENOSPC', 'EPERM', 'EROFS'].includes(error?.code)
}

function getPartialArchivePath(version, targetKey) {
  return path.join(
    CONFIG.configDir,
    `.${packageName}-${version}-${targetKey}.tar.gz.part`,
  )
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

function removeFileIfPresent(filePath) {
  try {
    fs.unlinkSync(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

function formatDownloadSource(downloadUrl) {
  try {
    const parsedUrl = new URL(downloadUrl)
    return `${parsedUrl.origin}${parsedUrl.pathname}`
  } catch {
    return downloadUrl
  }
}

function printDownloadFailure(error) {
  const code = error.code ? ` (${error.code})` : ''
  console.error(`❌ Failed to download ${packageName}: ${error.message}${code}`)

  if (error.requestUrl) {
    console.error(`Download source: ${formatDownloadSource(error.requestUrl)}`)
  }
  if (error.downloadedBytes > 0) {
    const total = error.totalBytes ? ` of ${formatBytes(error.totalBytes)}` : ''
    console.error(
      `Saved ${formatBytes(error.downloadedBytes)}${total}; the next run will resume this download.`,
    )
  } else if (error.requestUrl) {
    console.error(
      'Please retry. The release host may be temporarily unavailable.',
    )
  } else {
    console.error(
      'The downloaded update could not be installed; the existing binary was preserved when possible.',
    )
  }
}

function prepareTempDownloadDir() {
  if (fs.existsSync(CONFIG.tempDownloadDir)) {
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
  }
  fs.mkdirSync(CONFIG.tempDownloadDir, { recursive: true })
}

async function downloadAndExtract(
  downloadUrl,
  version,
  targetKey,
  { quiet = false } = {},
) {
  let attempts = 0
  const partialArchivePath = getPartialArchivePath(version, targetKey)
  let totalBytes = null

  try {
    return await withRetries(
      async (attempt) => {
        attempts = attempt
        prepareTempDownloadDir()
        if (!quiet) term.write('Downloading...')

        let lastProgressTime = Date.now()
        const result = await downloadFile(downloadUrl, partialArchivePath, {
          timeout: CONFIG.downloadRequestTimeout,
          onProgress: ({ downloadedBytes, totalBytes: progressTotal }) => {
            totalBytes = progressTotal
            if (quiet) return
            const now = Date.now()
            if (
              now - lastProgressTime < 100 &&
              downloadedBytes !== progressTotal
            ) {
              return
            }
            lastProgressTime = now
            if (progressTotal) {
              const pct = Math.round((downloadedBytes / progressTotal) * 100)
              term.write(
                `Downloading... ${createProgressBar(pct)} ${pct}% of ${formatBytes(progressTotal)}`,
              )
            } else {
              term.write(`Downloading... ${formatBytes(downloadedBytes)}`)
            }
          },
        })
        totalBytes = result.totalBytes

        try {
          await pipeline(
            fs.createReadStream(partialArchivePath),
            zlib.createGunzip(),
            tar.x({ cwd: CONFIG.tempDownloadDir }),
          )
        } catch (error) {
          // A complete archive that cannot be extracted is corrupt. Do not
          // resume it on the next attempt.
          removeFileIfPresent(partialArchivePath)
          throw error
        }

        const tempBinaryPath = path.join(
          CONFIG.tempDownloadDir,
          CONFIG.binaryName,
        )
        if (!fs.existsSync(tempBinaryPath)) {
          const files = fs.readdirSync(CONFIG.tempDownloadDir)
          removeFileIfPresent(partialArchivePath)
          const error = new Error(
            `Binary not found after extraction. Expected: ${CONFIG.binaryName}, Available files: ${files.join(', ')}`,
          )
          error.retryable = false
          throw error
        }

        removeFileIfPresent(partialArchivePath)
        return tempBinaryPath
      },
      {
        maxAttempts: CONFIG.downloadMaxAttempts,
        shouldRetry: isRetryableDownloadError,
        onRetry: ({ nextAttempt, delayMs }) => {
          if (quiet) return
          term.writeLine(
            `Download interrupted. Retrying in ${delayMs / 1000}s (${nextAttempt}/${CONFIG.downloadMaxAttempts})...`,
          )
        },
      },
    )
  } catch (error) {
    try {
      fs.rmSync(CONFIG.tempDownloadDir, { recursive: true, force: true })
    } catch {
      // Best effort after a failed download.
    }

    trackUpdateFailed(error.message, version, {
      stage: 'download',
      errorCode: error.code,
      statusCode: error.statusCode,
      target: targetKey,
      attempts,
      bytesDownloaded: getFileSize(partialArchivePath),
      totalBytes: error.totalBytes || totalBytes,
    })
    error.downloadedBytes = getFileSize(partialArchivePath)
    error.totalBytes ||= totalBytes
    error.requestUrl ||= downloadUrl
    throw error
  }
}

async function stageBinary(
  version,
  targetKey = getDownloadTargetKey(),
  options = {},
) {
  const fileName = PLATFORM_TARGETS[targetKey]

  if (!fileName) {
    const error = new Error(
      `Unsupported platform: ${process.platform} ${process.arch}`,
    )
    trackUpdateFailed(error.message, version, {
      stage: 'platform_check',
      target: targetKey,
    })
    throw error
  }

  const downloadUrl = `${
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'
  }/api/releases/download/${version}/${fileName}`

  fs.mkdirSync(CONFIG.configDir, { recursive: true })
  const tempBinaryPath = await downloadAndExtract(
    downloadUrl,
    version,
    targetKey,
    options,
  )

  try {
    if (process.platform !== 'win32') {
      fs.chmodSync(tempBinaryPath, 0o755)
    }
  } catch (error) {
    try {
      fs.rmSync(CONFIG.tempDownloadDir, { recursive: true, force: true })
    } catch {
      // Preserve the original chmod error.
    }
    throw error
  }

  return { tempBinaryPath, version, targetKey }
}

function replaceFileWithRollback(sourcePath, targetPath, replacements) {
  const backupPath = fs.existsSync(targetPath)
    ? `${targetPath}.old.${Date.now()}.${replacements.length}`
    : null

  if (backupPath) {
    fs.renameSync(targetPath, backupPath)
  }

  try {
    fs.renameSync(sourcePath, targetPath)
  } catch (error) {
    if (backupPath && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, targetPath)
    }
    throw error
  }

  replacements.push({ backupPath, targetPath })
}

function rollbackReplacements(replacements) {
  for (const { backupPath, targetPath } of replacements.reverse()) {
    removeFileIfPresent(targetPath)
    if (backupPath && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, targetPath)
    }
  }
}

function commitReplacements(replacements) {
  for (const { backupPath } of replacements) {
    if (!backupPath) continue
    try {
      removeFileIfPresent(backupPath)
    } catch {
      // The replacement is already committed. A stale backup is safer than
      // rolling back a working install because cleanup failed.
    }
  }
}

function installStagedBinary({ tempBinaryPath, version, targetKey }) {
  const replacements = []
  const metadataTempPath = `${CONFIG.metadataPath}.new.${process.pid}`

  try {
    fs.writeFileSync(
      metadataTempPath,
      JSON.stringify({ version, target: targetKey }, null, 2),
    )
    replaceFileWithRollback(tempBinaryPath, CONFIG.binaryPath, replacements)

    // Move tree-sitter.wasm next to the binary if the tarball included
    // it. The CLI binary loads this at startup; embedding it inside the
    // binary itself was unreliable on Windows (bun --compile asset
    // bundling silently dropped or unbound it across several attempts),
    // so we ship it as a sibling file instead. Older artifacts that
    // pre-date this change won't have the wasm and will still install —
    // they'll just hit the same crash they had before, which is fine.
    const tempWasmPath = path.join(CONFIG.tempDownloadDir, 'tree-sitter.wasm')
    if (fs.existsSync(tempWasmPath)) {
      const targetWasmPath = path.join(
        path.dirname(CONFIG.binaryPath),
        'tree-sitter.wasm',
      )
      replaceFileWithRollback(tempWasmPath, targetWasmPath, replacements)
    }

    replaceFileWithRollback(metadataTempPath, CONFIG.metadataPath, replacements)
    commitReplacements(replacements)
  } catch (error) {
    rollbackReplacements(replacements)
    throw error
  } finally {
    removeFileIfPresent(metadataTempPath)
    if (fs.existsSync(CONFIG.tempDownloadDir)) {
      fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    }
  }

  term.clearLine()
  console.log('Download complete! Starting Freebuff...')
}

async function downloadBinary(version, targetKey = getDownloadTargetKey()) {
  const stagedBinary = await stageBinary(version, targetKey)
  installStagedBinary(stagedBinary)
}

async function ensureBinaryExists() {
  const currentVersion = getCurrentVersion()
  if (currentVersion !== null) {
    return
  }

  const version = await getLatestVersion()
  if (!version) {
    console.error('❌ Failed to determine latest version')
    console.error('Please check your internet connection and try again')
    process.exit(1)
  }

  try {
    await downloadBinary(version)
  } catch (error) {
    term.clearLine()
    printDownloadFailure(error)
    process.exit(1)
  }
}

function stopRunningProcess(runningProcess) {
  return new Promise((resolve, reject) => {
    let forceKillTimer
    let forceKillTimeout

    const cleanup = () => {
      clearTimeout(forceKillTimer)
      clearTimeout(forceKillTimeout)
      runningProcess.removeListener('exit', handleExit)
    }
    const handleExit = () => {
      cleanup()
      resolve()
    }
    const fail = (error) => {
      cleanup()
      reject(error)
    }

    runningProcess.once('exit', handleExit)
    forceKillTimer = setTimeout(() => {
      forceKillTimeout = setTimeout(() => {
        fail(new Error(`${packageName} did not exit after SIGKILL`))
      }, 1000)
      try {
        runningProcess.kill('SIGKILL')
      } catch (error) {
        fail(error)
      }
    }, 5000)
    try {
      runningProcess.kill('SIGTERM')
    } catch (error) {
      fail(error)
    }
  })
}

async function checkForUpdates(runningProcess, exitListener) {
  let stoppedForUpdate = false

  try {
    const currentVersion = getCurrentVersion()

    const latestVersion = await getLatestVersion()
    if (!latestVersion) return

    if (
      currentVersion === null ||
      compareVersions(currentVersion, latestVersion) < 0
    ) {
      const stagedBinary = await stageBinary(
        latestVersion,
        getDownloadTargetKey(),
        { quiet: true },
      )

      term.clearLine()

      runningProcess.removeListener('exit', exitListener)
      try {
        await stopRunningProcess(runningProcess)
      } catch (error) {
        runningProcess.on('exit', exitListener)
        throw error
      }
      stoppedForUpdate = true

      resetTerminal({ exitAlternateScreen: true })
      console.log(`Update available: ${currentVersion} → ${latestVersion}`)

      installStagedBinary(stagedBinary)

      const newChild = spawnInstalledBinary({ detached: false })
      attachExitHandler(newChild)

      return new Promise(() => {})
    }
  } catch (error) {
    if (stoppedForUpdate && fs.existsSync(CONFIG.binaryPath)) {
      console.error(
        `Update failed; restarting ${packageName} ${getCurrentVersion()}.`,
      )
      const child = spawnInstalledBinary({ detached: false })
      attachExitHandler(child)
      return new Promise(() => {})
    }
    try {
      fs.rmSync(CONFIG.tempDownloadDir, { recursive: true, force: true })
    } catch {
      // Best effort after a failed background update.
    }
    // A staging failure leaves the current process and binary untouched.
  }
}

function printCrashDiagnostics(code, signal) {
  // Windows NTSTATUS codes (unsigned DWORD)
  const unsignedCode = getUnsignedExitCode(code)
  const isIllegalInstruction = isIllegalInstructionExit(code, signal)
  const isAccessViolation =
    signal === 'SIGSEGV' ||
    (process.platform === 'win32' && unsignedCode === 0xC0000005)
  const isBusError = signal === 'SIGBUS'
  const isAbort =
    signal === 'SIGABRT' ||
    (process.platform === 'win32' && unsignedCode === 0xC0000409)

  if (!isIllegalInstruction && !isAccessViolation && !isBusError && !isAbort) return

  const exitInfo = signal ? `signal ${signal}` : `code ${code}`
  console.error('')
  console.error(`❌ ${packageName} exited immediately (${exitInfo})`)
  console.error('')

  if (isIllegalInstruction) {
    console.error('Your CPU may not support the required instruction set (AVX2).')
    console.error('This typically affects CPUs from before 2013.')
    console.error('')
    printBaselineOverrideHint()
  } else if (isAccessViolation) {
    console.error('The binary crashed with an access violation.')
    console.error('')
  } else if (isBusError) {
    console.error('The binary crashed with a bus error.')
    console.error('This may indicate a platform compatibility issue.')
    console.error('')
  } else if (isAbort) {
    console.error('The binary crashed with an abort signal.')
    console.error('')
  }

  printSystemInfo()
  console.error('')
  console.error('Please report this issue at:')
  console.error('  https://github.com/CodebuffAI/codebuff/issues')
  console.error('')
}

function printBaselineOverrideHint() {
  const fallbackTarget = getBaselineFallbackTargetKey()
  if (!fallbackTarget) return
  console.error('To force the baseline (non-AVX2) build, set:')
  console.error(`  ${packageName.toUpperCase()}_BINARY_TARGET=${fallbackTarget}`)
  console.error('')
}

function printSystemInfo() {
  const metadata = getCurrentMetadata()
  console.error('System info:')
  console.error(`  Platform: ${process.platform} ${process.arch}`)
  console.error(`  Node:     ${process.version}`)
  if (process.arch === 'x64') {
    console.error(`  AVX2:     ${machineHasAvx2() ? 'yes' : 'no'}`)
  }
  console.error(`  Target:   ${metadata?.target || getDefaultTargetKey()}`)
  console.error(`  Binary:   ${CONFIG.binaryPath}`)
}

function getInstalledBinaryStatus() {
  try {
    const stats = fs.statSync(CONFIG.binaryPath)
    return stats.isFile() ? `yes (${formatBytes(stats.size)})` : 'no'
  } catch {
    return 'no'
  }
}

function printSpawnFailure(err) {
  resetTerminal()
  const code = err && err.code ? ` (${err.code})` : ''

  console.error(`Failed to start ${packageName}: ${err.message}${code}`)
  console.error('')
  printSystemInfo()
  console.error(`  Exists:   ${getInstalledBinaryStatus()}`)

  if (process.platform === 'win32') {
    console.error('')
    console.error(
      'On Windows, this can happen when Windows Security or antivirus blocks',
    )
    console.error(
      'or quarantines the downloaded executable, or when the binary requires',
    )
    console.error('CPU instructions that are not available on this machine.')
    console.error('')
    printBaselineOverrideHint()
  }

  console.error('')
  console.error('Try deleting the downloaded files and running again:')
  console.error(`  ${CONFIG.configDir}`)
  console.error('')
}

function exitOnSpawnFailure(err) {
  printSpawnFailure(err)
  process.exit(1)
}

function spawnInstalledBinary(options = {}) {
  if (!fs.existsSync(CONFIG.binaryPath)) {
    try {
      if (fs.existsSync(CONFIG.metadataPath)) fs.unlinkSync(CONFIG.metadataPath)
    } catch {
      // best effort
    }
    const error = new Error(
      `downloaded binary is missing at ${CONFIG.binaryPath}`,
    )
    error.code = 'BINARY_MISSING'
    exitOnSpawnFailure(error)
  }

  // spawn() only emits 'error' asynchronously for a few errno values
  // (EACCES, EAGAIN, EMFILE, ENFILE, ENOENT); everything else — notably
  // UNKNOWN on Windows when antivirus or Smart App Control blocks the
  // exe or the download is corrupt — is thrown synchronously.
  let child
  try {
    child = spawn(CONFIG.binaryPath, process.argv.slice(2), {
      stdio: 'inherit',
      ...options,
    })
  } catch (err) {
    exitOnSpawnFailure(err)
  }

  child.on('error', exitOnSpawnFailure)

  return child
}

async function tryFallbackToBaseline(code, signal) {
  if (!isIllegalInstructionExit(code, signal)) {
    return false
  }

  const fallbackTarget = getBaselineFallbackTargetKey()
  if (!fallbackTarget) {
    return false
  }

  const metadata = getCurrentMetadata()
  const currentTarget = metadata?.target || getDefaultTargetKey()
  if (currentTarget === fallbackTarget) {
    return false
  }

  const version = metadata?.version || (await getLatestVersion())
  if (!version) {
    return false
  }

  resetTerminal({
    exitAlternateScreen: shouldExitAlternateScreen(code, signal),
  })
  console.error('')
  console.error(
    `${packageName} is switching to the older-CPU binary for this machine.`,
  )

  try {
    await downloadBinary(version, fallbackTarget)
  } catch (error) {
    term.clearLine()
    console.error(`Failed to download ${fallbackTarget}: ${error.message}`)
    return false
  }

  const child = spawnInstalledBinary({ detached: false })
  attachExitHandler(child, false)
  return true
}

function attachExitHandler(child, allowBaselineFallback = true) {
  const exitListener = async (code, signal) => {
    if (
      allowBaselineFallback &&
      (await tryFallbackToBaseline(code, signal))
    ) {
      return
    }

    resetTerminal({
      exitAlternateScreen: shouldExitAlternateScreen(code, signal),
    })
    printCrashDiagnostics(code, signal)
    process.exit(signal ? 1 : (code || 0))
  }

  child.on('exit', exitListener)
  return exitListener
}

async function main() {
  await ensureBinaryExists()

  const child = spawnInstalledBinary()
  const exitListener = attachExitHandler(child)

  setTimeout(() => {
    checkForUpdates(child, exitListener)
  }, 100)
}

module.exports = { stopRunningProcess }

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error.message)
    process.exit(1)
  })
}
