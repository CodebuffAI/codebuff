#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

const tar = require('tar')

const packageName = 'codebuff'

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

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': CONFIG.userAgent,
        ...options.headers,
      },
    }

    const req = https.get(reqOptions, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
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

function runSmokeTest(binaryPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(binaryPath)) {
      resolve(false)
      return
    }

    const child = spawn(binaryPath, ['--version'], {
      cwd: os.homedir(),
      stdio: 'pipe',
    })

    let output = ''

    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 1000)
      resolve(false)
    }, 5000)

    child.on('exit', (code) => {
      clearTimeout(timeout)
      // Check that it exits successfully and outputs something that looks like a version
      if (code === 0 && output.trim().match(/^\d+(\.\d+)*$/)) {
        resolve(true)
      } else {
        resolve(false)
      }
    })

    child.on('error', () => {
      clearTimeout(timeout)
      resolve(false)
    })
  })
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

  // Run smoke test on the downloaded binary
  term.write('Verifying download...')
  const smokeTestPassed = await runSmokeTest(tempBinaryPath)

  if (!smokeTestPassed) {
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    const error = new Error('Downloaded binary failed smoke test (--version check)')
    trackUpdateFailed(error.message, version, { stage: 'smoke_test' })
    throw error
  }

  // Smoke test passed - move binary to final location
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
    process.exit(1)
  }

  try {
    await downloadBinary(version)
  } catch (error) {
    term.clearLine()
    console.error('❌ Failed to download codebuff:', error.message)
    console.error('Please check your internet connection and try again')
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
      runningProcess.kill('SIGTERM')

      await new Promise((resolve) => {
        runningProcess.on('exit', resolve)
        setTimeout(() => {
          if (!runningProcess.killed) {
            runningProcess.kill('SIGKILL')
          }
          resolve()
        }, 5000)
      })

      console.log(`Update available: ${currentVersion} → ${latestVersion}`)

      await downloadBinary(latestVersion)

      const newChild = spawn(CONFIG.binaryPath, process.argv.slice(2), {
        stdio: 'inherit',
        detached: false,
      })

      newChild.on('exit', (code) => {
        process.exit(code || 0)
      })

      return new Promise(() => {})
    }
  } catch (error) {
    // Ignore update failures
  }
}

async function main() {
  await ensureBinaryExists()

  const child = spawn(CONFIG.binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
  })

  const exitListener = (code) => {
    process.exit(code || 0)
  }

  child.on('exit', exitListener)

  setTimeout(() => {
    checkForUpdates(child, exitListener)
  }, 100)
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message)
  process.exit(1)
})
