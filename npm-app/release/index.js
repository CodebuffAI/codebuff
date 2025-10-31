#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const https = require('https')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

const { Command } = require('commander')
const tar = require('tar')

const CONFIG = {
  homeDir: os.homedir(),
  configDir: path.join(os.homedir(), '.config', 'manicode'),
  binaryName: process.platform === 'win32' ? 'codebuff.exe' : 'codebuff',
  githubRepo: 'CodebuffAI/codebuff',
  userAgent: 'codebuff-cli',
  requestTimeout: 20000,
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
let isPrintMode = false
const term = {
  clearLine: () => {
    if (!isPrintMode && process.stderr.isTTY) {
      process.stderr.write('\r\x1b[K')
    }
  },
  write: (text) => {
    if (!isPrintMode) {
      term.clearLine()
      process.stderr.write(text)
    }
  },
  writeLine: (text) => {
    if (!isPrintMode) {
      term.clearLine()
      process.stderr.write(text + '\n')
    }
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
      reject(new Error('Request timeout.'))
    })
  })
}

async function getLatestVersion() {
  try {
    const res = await httpGet(
      `https://github.com/${CONFIG.githubRepo}/releases.atom`,
    )

    if (res.statusCode !== 200) return null

    const body = await streamToString(res)

    // Parse the Atom XML to extract the latest release tag
    const tagMatch = body.match(
      /<id>tag:github\.com,2008:Repository\/\d+\/v(\d+\.\d+\.\d+)<\/id>/,
    )
    if (tagMatch && tagMatch[1]) {
      return tagMatch[1]
    }

    return null
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
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(CONFIG.binaryPath)) {
        resolve('error')
        return
      }

      const child = spawn(CONFIG.binaryPath, ['--version'], {
        cwd: os.homedir(),
        stdio: 'pipe',
      })

      let output = ''
      let errorOutput = ''

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 1000)
        resolve('error')
      }, 1000)

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
    } catch (error) {
      resolve('error')
    }
  })
}

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0

  if (v1.match(/^\d+(\.\d+)*$/)) {
    return -1
  }

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

  // Use proxy endpoint that handles version mapping
  const downloadUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
    ? `${process.env.NEXT_PUBLIC_CODEBUFF_APP_URL}/api/releases/download/${version}/${fileName}`
    : `https://codebuff.com/api/releases/download/${version}/${fileName}`

  // Ensure config directory exists
  fs.mkdirSync(CONFIG.configDir, { recursive: true })

  if (fs.existsSync(CONFIG.binaryPath)) {
    fs.unlinkSync(CONFIG.binaryPath)
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
        `Binary not found after extraction. Expected: ${extractedPath}, Available files: ${files.join(', ')}`,
      )
    }
  } catch (error) {
    term.clearLine()
    if (!isPrintMode) {
      console.error(`Extraction failed: ${error.message}`)
    }
    process.exit(1)
  }

  term.clearLine()
  if (isPrintMode) {
    console.log(
      JSON.stringify({ type: 'download', version, status: 'complete' }),
    )
  } else {
    console.log('Download complete! Starting Codebuff...')
  }
}

async function ensureBinaryExists() {
  const currentVersion = await getCurrentVersion()
  if (currentVersion !== null && currentVersion !== 'error') {
    return
  }

  const version = await getLatestVersion()
  if (!version) {
    if (isPrintMode) {
      console.error(
        JSON.stringify({
          type: 'error',
          message: 'Failed to determine latest version.',
        }),
      )
    } else {
      console.error('❌ Failed to determine latest version')
      console.error('Please check your internet connection and try again')
    }
    process.exit(1)
  }

  try {
    await downloadBinary(version)
  } catch (error) {
    term.clearLine()
    if (isPrintMode) {
      console.error(
        JSON.stringify({
          type: 'error',
          message: `Failed to download codebuff: ${error.message}`,
        }),
      )
    } else {
      console.error('❌ Failed to download codebuff:', error.message)
      console.error('Please check your internet connection and try again')
    }
    process.exit(1)
  }
}

async function checkForUpdates(runningProcess, exitListener, retry) {
  try {
    const currentVersion = await getCurrentVersion()

    const latestVersion = await getLatestVersion()
    if (!latestVersion) return

    if (
      // Download new version if current binary errors.
      currentVersion === 'error' ||
      compareVersions(currentVersion, latestVersion) < 0
    ) {
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

      if (!isPrintMode) {
        console.log(`Update available: ${currentVersion} → ${latestVersion}`)
      }

      await downloadBinary(latestVersion)

      await retry(isPrintMode)
    }
  } catch (error) {
    // Silently ignore update check errors
  }
}

async function main(firstRun = false, printMode = false) {
  isPrintMode = printMode
  await ensureBinaryExists()

  let error = null
  try {
    // Start codebuff
    const child = spawn(CONFIG.binaryPath, process.argv.slice(2), {
      stdio: 'inherit',
    })

    // Store reference to the exit listener so we can remove it during updates
    const exitListener = (code) => {
      process.exit(code || 0)
    }

    child.on('exit', exitListener)

    if (firstRun) {
      // Check for updates in background
      setTimeout(() => {
        if (!error) {
          checkForUpdates(child, exitListener, () => main(false, isPrintMode))
        }
      }, 100)
    }
  } catch (err) {
    error = err
    if (firstRun) {
      if (!isPrintMode) {
        console.error('❌ Codebuff failed to start:', error.message)
        console.log('Redownloading Codebuff...')
      }
      // Binary could be corrupted (killed before download completed), so delete and retry.
      fs.unlinkSync(CONFIG.binaryPath)
      await main(false, isPrintMode)
    }
  }
}

// Setup commander
const program = new Command()
program
  .name('codebuff')
  .description('AI coding agent')
  .helpOption(false)
  .option('-p, --print', 'print mode - suppress wrapper output')
  .allowUnknownOption()
  .parse()

const options = program.opts()
isPrintMode = options.print

// Run the main function
main(true, isPrintMode).catch((error) => {
  if (!isPrintMode) {
    console.error('❌ Unexpected error:', error.message)
  }
  process.exit(1)
})
