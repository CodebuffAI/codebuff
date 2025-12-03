#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const https = require('https')
const path = require('path')
const zlib = require('zlib')

const tar = require('tar')

const packageName = 'codecane'

function createConfig(packageName) {
  // Store binary in package directory instead of ~/.config/manicode
  const packageDir = __dirname
  const binDir = path.join(packageDir, 'bin')
  const binaryName =
    process.platform === 'win32' ? `${packageName}.exe` : packageName

  return {
    packageDir,
    binDir,
    binaryName,
    binaryPath: path.join(binDir, binaryName),
    userAgent: `${packageName}-cli`,
    requestTimeout: 20000,
  }
}

const CONFIG = createConfig(packageName)

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
  if (!fs.existsSync(CONFIG.binaryPath)) return null

  try {
    return new Promise((resolve) => {
      const child = spawn(CONFIG.binaryPath, ['--version'], {
        cwd: CONFIG.packageDir,
        stdio: 'pipe',
      })

      let output = ''

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.stderr.on('data', () => {
        // Ignore stderr output
      })

      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 4000)
        resolve('error')
      }, 4000)

      child.on('exit', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          resolve(output.trim())
        } else {
          resolve('error')
        }
      })

      child.on('error', () => {
        clearTimeout(timeout)
        resolve('error')
      })
    })
  } catch (error) {
    return 'error'
  }
}

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0

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
    throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
  }

  const downloadUrl = `${
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'
  }/api/releases/download/${version}/${fileName}`

  // Create bin directory in package directory
  fs.mkdirSync(CONFIG.binDir, { recursive: true })

  if (fs.existsSync(CONFIG.binaryPath)) {
    try {
      fs.unlinkSync(CONFIG.binaryPath)
    } catch (err) {
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

  term.write('Downloading...')

  const res = await httpGet(downloadUrl)

  if (res.statusCode !== 200) {
    throw new Error(`Download failed: HTTP ${res.statusCode}`)
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

  await new Promise((resolve, reject) => {
    res
      .pipe(zlib.createGunzip())
      .pipe(tar.x({ cwd: CONFIG.binDir }))
      .on('finish', resolve)
      .on('error', reject)
  })

  try {
    const files = fs.readdirSync(CONFIG.binDir)
    const extractedPath = path.join(CONFIG.binDir, CONFIG.binaryName)

    if (fs.existsSync(extractedPath)) {
      if (process.platform !== 'win32') {
        fs.chmodSync(extractedPath, 0o755)
      }
    } else {
      throw new Error(
        `Binary not found after extraction. Expected: ${extractedPath}, Available files: ${files.join(', ')}`,
      )
    }
  } catch (error) {
    term.clearLine()
    console.error(`Extraction failed: ${error.message}`)
    process.exit(1)
  }

  term.clearLine()
  console.log('Download complete! Starting Codecane...')
}

async function ensureBinaryExists() {
  const currentVersion = await getCurrentVersion()
  if (currentVersion !== null && currentVersion !== 'error') {
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
    console.error('❌ Failed to download codecane:', error.message)
    console.error('Please check your internet connection and try again')
    process.exit(1)
  }
}

async function checkForUpdates(runningProcess, exitListener) {
  try {
    const currentVersion = await getCurrentVersion()
    if (!currentVersion) return

    const latestVersion = await getLatestVersion()
    if (!latestVersion) return

    if (
      currentVersion === 'error' ||
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
  console.log('\x1b[1m\x1b[91m' + '='.repeat(60) + '\x1b[0m')
  console.log('\x1b[1m\x1b[93m❄️ CODECANE STAGING ENVIRONMENT ❄️\x1b[0m')
  console.log(
    '\x1b[1m\x1b[91mFOR TESTING PURPOSES ONLY - NOT FOR PRODUCTION USE\x1b[0m',
  )
  console.log('\x1b[1m\x1b[91m' + '='.repeat(60) + '\x1b[0m')
  console.log('')

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
