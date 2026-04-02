#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const tls = require('tls')
const zlib = require('zlib')

const tar = require('tar')

const packageName = 'codebuff'

/**
 * Terminal escape sequences to reset terminal state after the child process exits.
 * When the binary is SIGKILL'd, it can't clean up its own terminal state.
 * The wrapper (this process) survives and must reset these modes.
 *
 * Keep in sync with TERMINAL_RESET_SEQUENCES in cli/src/utils/renderer-cleanup.ts
 */
const TERMINAL_RESET_SEQUENCES =
  '\x1b[?1049l' + // Exit alternate screen buffer
  '\x1b[?1000l' + // Disable X10 mouse mode
  '\x1b[?1002l' + // Disable button event mouse mode
  '\x1b[?1003l' + // Disable any-event mouse mode (all motion)
  '\x1b[?1006l' + // Disable SGR extended mouse mode
  '\x1b[?1004l' + // Disable focus reporting
  '\x1b[?2004l' + // Disable bracketed paste mode
  '\x1b[?25h' // Show cursor

function resetTerminal() {
  try {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false)
    }
  } catch {
    // stdin may be closed
  }
  try {
    if (process.stdout.isTTY) {
      process.stdout.write(TERMINAL_RESET_SEQUENCES)
    }
  } catch {
    // stdout may be closed
  }
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

function getProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  )
}

function shouldBypassProxy(hostname) {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || ''
  if (!noProxy) return false
  const domains = noProxy.split(',').map((d) => d.trim().toLowerCase().replace(/:\d+$/, ''))
  const host = hostname.toLowerCase()
  return domains.some((d) => {
    if (d === '*') return true
    if (d.startsWith('.')) return host.endsWith(d) || host === d.slice(1)
    return host === d || host.endsWith('.' + d)
  })
}

function connectThroughProxy(proxyUrl, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl)
    const isHttpsProxy = proxy.protocol === 'https:'
    const connectOptions = {
      hostname: proxy.hostname,
      port: proxy.port || (isHttpsProxy ? 443 : 80),
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: {
        Host: `${targetHost}:${targetPort}`,
      },
    }

    if (proxy.username || proxy.password) {
      const auth = Buffer.from(
        `${decodeURIComponent(proxy.username || '')}:${decodeURIComponent(proxy.password || '')}`,
      ).toString('base64')
      connectOptions.headers['Proxy-Authorization'] = `Basic ${auth}`
    }

    const transport = isHttpsProxy ? https : http
    const req = transport.request(connectOptions)

    req.on('connect', (res, socket) => {
      if (res.statusCode === 200) {
        resolve(socket)
      } else {
        socket.destroy()
        reject(
          new Error(`Proxy CONNECT failed with status ${res.statusCode}`),
        )
      }
    })

    req.on('error', (err) => {
      reject(new Error(`Proxy connection failed: ${err.message}`))
    })

    req.setTimeout(CONFIG.requestTimeout, () => {
      req.destroy()
      reject(new Error('Proxy connection timeout.'))
    })

    req.end()
  })
}

const PLATFORM_TARGETS = {
  'linux-x64': `${packageName}-linux-x64.tar.gz`,
  'linux-arm64': `${packageName}-linux-arm64.tar.gz`,
  'darwin-x64': `${packageName}-darwin-x64.tar.gz`,
  'darwin-arm64': `${packageName}-darwin-arm64.tar.gz`,
  'win32-x64': `${packageName}-win32-x64.tar.gz`,
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

async function httpGet(url, options = {}) {
  const parsedUrl = new URL(url)
  const proxyUrl = getProxyUrl()

  const reqOptions = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    headers: {
      'User-Agent': CONFIG.userAgent,
      ...options.headers,
    },
  }

  if (proxyUrl && !shouldBypassProxy(parsedUrl.hostname)) {
    const tunnelSocket = await connectThroughProxy(
      proxyUrl,
      parsedUrl.hostname,
      parsedUrl.port || 443,
    )
    reqOptions.agent = false
    reqOptions.createConnection = () =>
      tls.connect({
        socket: tunnelSocket,
        servername: parsedUrl.hostname,
      })
  }

  return new Promise((resolve, reject) => {
    const req = https.get(reqOptions, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        res.resume()
        return httpGet(new URL(res.headers.location, url).href, options)
          .then(resolve)
          .catch(reject)
      }
      resolve(res)
    })

    req.on('error', reject)

    const timeout = options.timeout || CONFIG.requestTimeout
    req.setTimeout(timeout, () => {
      req.destroy()
      reject(new Error('Request timeout.'))
    })
  })
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
    if (!fs.existsSync(CONFIG.metadataPath)) {
      return null
    }
    const metadata = JSON.parse(fs.readFileSync(CONFIG.metadataPath, 'utf8'))
    // Also verify the binary still exists
    if (!fs.existsSync(CONFIG.binaryPath)) {
      return null
    }
    return metadata.version || null
  } catch (error) {
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

async function downloadBinary(version) {
  const platformKey = `${process.platform}-${process.arch}`
  const fileName = PLATFORM_TARGETS[platformKey]

  if (!fileName) {
    const error = new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
    trackUpdateFailed(error.message, version, { stage: 'platform_check' })
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
    trackUpdateFailed(error.message, version, { stage: 'http_download', statusCode: res.statusCode })
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
    trackUpdateFailed(error.message, version, { stage: 'extraction' })
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

    // Save version metadata for fast version checking
    fs.writeFileSync(
      CONFIG.metadataPath,
      JSON.stringify({ version }, null, 2),
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

      resetTerminal()
      console.log(`Update available: ${currentVersion} → ${latestVersion}`)

      await downloadBinary(latestVersion)

      const newChild = spawn(CONFIG.binaryPath, process.argv.slice(2), {
        stdio: 'inherit',
        detached: false,
      })

      newChild.on('exit', (code, signal) => {
        resetTerminal()
        printCrashDiagnostics(code, signal)
        process.exit(signal ? 1 : (code || 0))
      })

      newChild.on('error', (err) => {
        console.error('Failed to start codebuff:', err.message)
        process.exit(1)
      })

      return new Promise(() => {})
    }
  } catch (error) {
    // Ignore update failures
  }
}

function printCrashDiagnostics(code, signal) {
  // Windows NTSTATUS codes (unsigned DWORD)
  const unsignedCode = code != null && code < 0 ? (code >>> 0) : code
  const isIllegalInstruction =
    signal === 'SIGILL' ||
    (process.platform === 'win32' && unsignedCode === 0xC000001D)
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

async function main() {
  await ensureBinaryExists()

  const child = spawn(CONFIG.binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
  })

  const exitListener = (code, signal) => {
    resetTerminal()
    printCrashDiagnostics(code, signal)
    process.exit(signal ? 1 : (code || 0))
  }

  child.on('exit', exitListener)

  child.on('error', (err) => {
    console.error('Failed to start codebuff:', err.message)
    process.exit(1)
  })

  setTimeout(() => {
    checkForUpdates(child, exitListener)
  }, 100)
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message)
  process.exit(1)
})
