#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

const tar = require('tar')
const { createReleaseHttpClient } = require('./http')

const packageName = 'codebuff'

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
    metadataPath: path.join(configDir, 'codebuff-metadata.json'),
    tempDownloadDir: path.join(configDir, '.download-temp'),
    userAgent: `${packageName}-cli`,
    requestTimeout: 20000,
  }
}

const CONFIG = createConfig(packageName)
const { getProxyUrl, httpGet } = createReleaseHttpClient({
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
      event: 'cli.update_codebuff_failed',
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
    req.on('error', () => {}) // Silently ignore errors
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
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    return true
  }

  try {
    return /\bavx2\b/i.test(fs.readFileSync('/proc/cpuinfo', 'utf8'))
  } catch {
    return true
  }
}

function getDefaultTargetKey() {
  const override = getTargetOverride()
  if (override) {
    return override
  }

  const platformKey = getPlatformKey()
  if (platformKey === 'linux-x64' && !linuxCpuHasAvx2()) {
    return 'linux-x64-baseline'
  }

  return platformKey
}

function getBaselineFallbackTargetKey() {
  // Windows has no reliable plain-Node CPU feature check here, so we keep
  // the fast x64 binary first and fall back after the native SIGILL code.
  return BASELINE_FALLBACK_TARGETS[getPlatformKey()] || null
}

function isTargetAllowedForThisMachine(target) {
  const override = getTargetOverride()
  if (override) {
    return target === override
  }
  return (
    target === getDefaultTargetKey() ||
    target === getBaselineFallbackTargetKey()
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
    // Also verify the binary still exists
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

  // Always update if the current version is not a valid semver
  // e.g. 1.0.420-beta.1
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

async function downloadBinary(version, targetKey = getDownloadTargetKey()) {
  const fileName = PLATFORM_TARGETS[targetKey]

  if (!fileName) {
    const error = new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
    trackUpdateFailed(error.message, version, { stage: 'platform_check', target: targetKey })
    throw error
  }

  const downloadUrl = `${
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'
  }/api/releases/download/${version}/${fileName}`

  // Ensure config directory exists
  fs.mkdirSync(CONFIG.configDir, { recursive: true })

  // Clean up any previous temp download directory
  if (fs.existsSync(CONFIG.tempDownloadDir)) {
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
  }
  fs.mkdirSync(CONFIG.tempDownloadDir, { recursive: true })

  term.write('Downloading...')

  const res = await httpGet(downloadUrl)

  if (res.statusCode !== 200) {
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    const error = new Error(`Download failed: HTTP ${res.statusCode}`)
    trackUpdateFailed(error.message, version, { stage: 'http_download', statusCode: res.statusCode, target: targetKey })
    throw error
  }

  const totalSize = parseInt(res.headers['content-length'] || '0', 10)
  let downloadedSize = 0
  let lastProgressTime = Date.now()

  res.on('data', (chunk) => {
    downloadedSize += chunk.length
    const now = Date.now()
    if (now - lastProgressTime >= 100 || downloadedSize === totalSize) {
      lastProgressTime = now
      if (totalSize > 0) {
        const pct = Math.round((downloadedSize / totalSize) * 100)
        term.write(
          `Downloading... ${createProgressBar(pct)} ${pct}% of ${formatBytes(
            totalSize,
          )}`,
        )
      } else {
        term.write(`Downloading... ${formatBytes(downloadedSize)}`)
      }
    }
  })

  // Extract to temp directory
  await new Promise((resolve, reject) => {
    res
      .pipe(zlib.createGunzip())
      .pipe(tar.x({ cwd: CONFIG.tempDownloadDir }))
      .on('finish', resolve)
      .on('error', reject)
  })

  const tempBinaryPath = path.join(CONFIG.tempDownloadDir, CONFIG.binaryName)

  // Verify the binary was extracted
  if (!fs.existsSync(tempBinaryPath)) {
    const files = fs.readdirSync(CONFIG.tempDownloadDir)
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    const error = new Error(
      `Binary not found after extraction. Expected: ${CONFIG.binaryName}, Available files: ${files.join(', ')}`,
    )
    trackUpdateFailed(error.message, version, { stage: 'extraction', target: targetKey })
    throw error
  }

  // Set executable permissions
  if (process.platform !== 'win32') {
    fs.chmodSync(tempBinaryPath, 0o755)
  }

  // Move binary to final location
  try {
    if (fs.existsSync(CONFIG.binaryPath)) {
      try {
        fs.unlinkSync(CONFIG.binaryPath)
      } catch (err) {
        // Fallback: try renaming the locked/undeletable binary (Windows)
        const backupPath = CONFIG.binaryPath + `.old.${Date.now()}`
        try {
          fs.renameSync(CONFIG.binaryPath, backupPath)
        } catch (renameErr) {
          throw new Error(
            `Failed to replace existing binary. ` +
              `unlink error: ${err.code || err.message}, ` +
              `rename error: ${renameErr.code || renameErr.message}`,
          )
        }
      }
    }
    fs.renameSync(tempBinaryPath, CONFIG.binaryPath)

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
      try {
        if (fs.existsSync(targetWasmPath)) fs.unlinkSync(targetWasmPath)
      } catch {
        // best effort; rename below will surface the real error if it matters
      }
      fs.renameSync(tempWasmPath, targetWasmPath)
    }

    // Save version metadata for fast version checking
    fs.writeFileSync(
      CONFIG.metadataPath,
      JSON.stringify({ version, target: targetKey }, null, 2),
    )
  } finally {
    // Clean up temp directory even if rename fails
    if (fs.existsSync(CONFIG.tempDownloadDir)) {
      fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    }
  }

  term.clearLine()
  console.log('Download complete! Starting Codebuff...')
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
    if (!getProxyUrl()) {
      console.error(
        'If you are behind a proxy, set the HTTPS_PROXY environment variable',
      )
    }
    process.exit(1)
  }

  try {
    await downloadBinary(version)
  } catch (error) {
    term.clearLine()
    console.error('❌ Failed to download codebuff:', error.message)
    console.error('Please check your internet connection and try again')
    if (!getProxyUrl()) {
      console.error(
        'If you are behind a proxy, set the HTTPS_PROXY environment variable',
      )
    }
    process.exit(1)
  }
}

async function checkForUpdates(runningProcess, exitListener) {
  try {
    const currentVersion = getCurrentVersion()

    const latestVersion = await getLatestVersion()
    if (!latestVersion) return

    if (
      // Download new version if current version is unknown or outdated.
      currentVersion === null ||
      compareVersions(currentVersion, latestVersion) < 0
    ) {
      term.clearLine()

      runningProcess.removeListener('exit', exitListener)

      await new Promise((resolve) => {
        let exited = false
        runningProcess.once('exit', () => {
          exited = true
          resolve()
        })
        runningProcess.kill('SIGTERM')
        setTimeout(() => {
          if (!exited) {
            runningProcess.kill('SIGKILL')
            // Safety: resolve after giving SIGKILL time to take effect
            setTimeout(() => resolve(), 1000)
          }
        }, 5000)
      })

      resetTerminal({ exitAlternateScreen: true })
      console.log(`Update available: ${currentVersion} → ${latestVersion}`)

      await downloadBinary(latestVersion)

      const newChild = spawnInstalledBinary({ detached: false })
      attachExitHandler(newChild)

      return new Promise(() => {})
    }
  } catch (error) {
    // Ignore update failures
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
    console.error('Unfortunately, this binary is not compatible with your system.')
    console.error('')
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

  console.error('System info:')
  console.error(`  Platform: ${process.platform} ${process.arch}`)
  console.error(`  Node:     ${process.version}`)
  console.error(`  Binary:   ${CONFIG.binaryPath}`)
  console.error('')
  console.error('Please report this issue at:')
  console.error('  https://github.com/CodebuffAI/codebuff/issues')
  console.error('')
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
  console.error('System info:')
  console.error(`  Platform: ${process.platform} ${process.arch}`)
  console.error(`  Node:     ${process.version}`)
  console.error(`  Binary:   ${CONFIG.binaryPath}`)
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

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message)
  process.exit(1)
})
