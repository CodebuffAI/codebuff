#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn, execSync } = require('child_process')
const https = require('https')
const zlib = require('zlib')
const tar = require('tar')

const CONFIG = {
  homeDir: os.homedir(),
  configDir: path.join(os.homedir(), '.config', 'manicode'),
  binaryName: process.platform === 'win32' ? 'codebuff.exe' : 'codebuff',
  githubRepo: 'CodebuffAI/codebuff-community',
  userAgent: 'codebuff-cli',
  requestTimeout: 10000,
}

CONFIG.binaryPath = path.join(CONFIG.configDir, CONFIG.binaryName)

// Platform target mapping
const PLATFORM_TARGETS = {
  'linux-x64': 'codebuff-linux-x64.tar.gz',
  'linux-arm64': 'codebuff-linux-arm64.tar.gz',
  'darwin-x64': 'codebuff-darwin-x64.tar.gz',
  'darwin-arm64': 'codebuff-darwin-arm64.tar.gz',
  'win32-x64': 'codebuff-win32-x64.tar.gz',
}

// Terminal utilities
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

// Utility functions
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

    // Add GitHub token if available
    const token = process.env.GITHUB_TOKEN
    if (token) {
      console.log('Using your GITHUB_TOKEN to download the latest version.')
      reqOptions.headers.Authorization = `Bearer ${token}`
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
      reject(new Error('Request timeout'))
    })
  })
}

async function getLatestVersion() {
  const res = await httpGet(
    `https://api.github.com/repos/${CONFIG.githubRepo}/releases/latest`
  )

  /* ── simple rate-limit fallback ─────────────────────────── */
  if (res.statusCode === 403 && res.headers['x-ratelimit-remaining'] === '0') {
    term.writeLine(
      'GitHub API rate-limit reached. Skipping version check – either wait an hour or set GITHUB_TOKEN and try again.'
    )
    return null
  }

  if (res.statusCode !== 200) return null // other errors

  const body = await streamToString(res)
  return JSON.parse(body).tag_name?.replace(/^v/, '') || null
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
    const result = execSync(`"${CONFIG.binaryPath}" --version`, {
      cwd: os.homedir(),
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 1000,
    })
    return result.trim()
  } catch (error) {
    return null
  }
}

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0

  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0

    if (p1 < p2) return -1
    if (p1 > p2) return 1
  }

  return 0
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

  const downloadUrl = `https://github.com/${CONFIG.githubRepo}/releases/download/v${version}/${fileName}`

  // Ensure config directory exists
  fs.mkdirSync(CONFIG.configDir, { recursive: true })

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
            totalSize
          )}`
        )
      } else {
        term.write(`Downloading... ${formatBytes(downloadedSize)}`)
      }
    }
  })

  await new Promise((resolve, reject) => {
    res
      .pipe(zlib.createGunzip())
      .pipe(tar.x({ cwd: CONFIG.configDir }))
      .on('finish', resolve)
      .on('error', reject)
  })

  try {
    // Find the extracted binary - it should be named "codebuff" or "codebuff.exe"
    const files = fs.readdirSync(CONFIG.configDir)
    const extractedPath = path.join(CONFIG.configDir, CONFIG.binaryName)

    if (fs.existsSync(extractedPath)) {
      if (process.platform !== 'win32') {
        fs.chmodSync(extractedPath, 0o755)
      }
    } else {
      throw new Error(
        `Binary not found after extraction. Expected: ${extractedPath}, Available files: ${files.join(', ')}`
      )
    }
  } catch (error) {
    term.clearLine()
    console.error(`Extraction failed: ${error.message}`)
    process.exit(1)
  }

  term.clearLine()
  console.log('Download complete! Starting Codebuff...')
}

async function ensureBinaryExists() {
  if (!fs.existsSync(CONFIG.binaryPath)) {
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
      console.error('Please try again later.')
      process.exit(1)
    }
  }
}

async function checkForUpdates(runningProcess, exitListener) {
  try {
    const currentVersion = getCurrentVersion()
    if (!currentVersion) return

    const latestVersion = await getLatestVersion()
    if (!latestVersion) return

    if (compareVersions(currentVersion, latestVersion) < 0) {
      term.clearLine()

      // Remove the specific exit listener to prevent it from interfering with the update
      runningProcess.removeListener('exit', exitListener)

      // Kill the running process
      runningProcess.kill('SIGTERM')

      // Wait for the process to actually exit
      await new Promise((resolve) => {
        runningProcess.on('exit', resolve)
        // Fallback timeout in case the process doesn't exit gracefully
        setTimeout(() => {
          if (!runningProcess.killed) {
            runningProcess.kill('SIGKILL')
          }
          resolve()
        }, 5000)
      })

      console.log(`Update available: ${currentVersion} → ${latestVersion}`)

      await downloadBinary(latestVersion)

      // Restart with new binary - this replaces the current process
      const newChild = spawn(CONFIG.binaryPath, process.argv.slice(2), {
        stdio: 'inherit',
        detached: false,
      })

      // Set up exit handler for the new process
      newChild.on('exit', (code) => {
        process.exit(code || 0)
      })

      // Don't return - keep this function running to maintain the wrapper
      return new Promise(() => {}) // Never resolves, keeps wrapper alive
    }
  } catch (error) {
    // Silently ignore update check errors
  }
}

async function main() {
  await ensureBinaryExists()

  // Start codebuff
  const child = spawn(CONFIG.binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
  })

  // Store reference to the exit listener so we can remove it during updates
  const exitListener = (code) => {
    process.exit(code || 0)
  }

  child.on('exit', exitListener)

  // Check for updates in background
  setTimeout(() => {
    checkForUpdates(child, exitListener)
  }, 100)
}

// Run the main function
main().catch((error) => {
  console.error('❌ Unexpected error:', error.message)
  process.exit(1)
})
