#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn, execSync } = require('child_process')
const https = require('https')
const zlib = require('zlib')
const tar = require('tar')

// Configuration
const CONFIG = {
  homeDir: os.homedir(),
  configDir: path.join(os.homedir(), '.config', 'manicode'),
  binaryName: process.platform === 'win32' ? 'codebuff.exe' : 'codebuff',
  githubRepo: 'CodebuffAI/codebuff-community',
  userAgent: 'codebuff-cli',
  requestTimeout: 10000,
  updateCheckTimeout: 5000,
}

CONFIG.binaryPath = path.join(CONFIG.configDir, CONFIG.binaryName)

// Platform target mapping
const PLATFORM_TARGETS = {
  'linux-x64': 'codebuff-linux-x64.tar.gz',
  'linux-arm64': 'codebuff-linux-arm64.tar.gz',
  'darwin-x64': 'codebuff-darwin-x64.tar.gz',
  'darwin-arm64': 'codebuff-darwin-arm64.tar.gz',
  'win32-x64': 'codebuff-win32-x64.zip',
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

    const req = https.get(reqOptions, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return httpGet(res.headers.location, options)
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
  try {
    const res = await httpGet(
      `https://api.github.com/repos/${CONFIG.githubRepo}/releases/latest`
    )

    let data = ''
    for await (const chunk of res) {
      data += chunk
    }

    const release = JSON.parse(data)
    return release.tag_name?.replace(/^v/, '') || null
  } catch (error) {
    return null
  }
}

function getCurrentVersion() {
  if (!fs.existsSync(CONFIG.binaryPath)) return null

  try {
    const result = execSync(`"${CONFIG.binaryPath}" --version`, {
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

function showProgress(downloaded, total) {
  if (total > 0) {
    const percentage = Math.round((downloaded / total) * 100)
    process.stderr.write(`\r${percentage}%`)
  } else {
    const downloadedMB = (downloaded / 1024 / 1024).toFixed(1)
    process.stderr.write(`\r${downloadedMB} MB`)
  }
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

  console.log(`Downloading codebuff v${version}...`)

  const res = await httpGet(downloadUrl)

  if (res.statusCode !== 200) {
    throw new Error(`Download failed: HTTP ${res.statusCode}`)
  }

  const totalSize = parseInt(res.headers['content-length'] || '0', 10)
  let downloadedSize = 0
  let lastProgressTime = Date.now()

  const chunks = []

  for await (const chunk of res) {
    chunks.push(chunk)
    downloadedSize += chunk.length

    const now = Date.now()
    if (now - lastProgressTime >= 100 || downloadedSize === totalSize) {
      lastProgressTime = now
      showProgress(downloadedSize, totalSize)
    }
  }

  process.stderr.write('\n')
  console.log('Extracting...')

  const buffer = Buffer.concat(chunks)

  if (fileName.endsWith('.zip')) {
    // Windows ZIP extraction
    const AdmZip = require('adm-zip')
    const zipPath = path.join(CONFIG.configDir, fileName)

    fs.writeFileSync(zipPath, buffer)

    const zip = new AdmZip(zipPath)
    zip.extractAllTo(CONFIG.configDir, true)

    fs.unlinkSync(zipPath)
  } else {
    // Unix tar.gz extraction
    await new Promise((resolve, reject) => {
      const gunzip = zlib.createGunzip()
      const extract = tar.extract({ cwd: CONFIG.configDir })

      gunzip.pipe(extract).on('finish', resolve).on('error', reject)

      gunzip.end(buffer)
    })
  }

  // Rename extracted binary to standard name
  const extractedName = fileName.replace(/\.(tar\.gz|zip)$/, '')
  const extractedPath = path.join(CONFIG.configDir, extractedName)

  if (fs.existsSync(extractedPath)) {
    if (process.platform !== 'win32') {
      fs.chmodSync(extractedPath, 0o755)
    }
    fs.renameSync(extractedPath, CONFIG.binaryPath)
  } else {
    throw new Error(`Binary not found after extraction`)
  }
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
      console.error('❌ Failed to download codebuff:', error.message)
      console.error('Please try again later.')
      process.exit(1)
    }
  }

  // Verify binary is executable (Unix only)
  if (process.platform !== 'win32') {
    try {
      fs.accessSync(CONFIG.binaryPath, fs.constants.X_OK)
    } catch (error) {
      console.error(`❌ Binary is not executable: ${CONFIG.binaryPath}`)
      console.error('Run: chmod +x', CONFIG.binaryPath)
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

    console.log(`Current version: ${currentVersion}`)
    console.log(`Latest version: ${latestVersion}`)

    if (compareVersions(currentVersion, latestVersion) < 0) {
      console.log(`Updating...`)

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

      await downloadBinary(latestVersion)

      // Restart with new binary - this replaces the current process
      const newChild = spawn(CONFIG.binaryPath, process.argv.slice(2), {
        stdio: 'inherit',
        cwd: process.cwd(),
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
  // Ensure binary exists
  await ensureBinaryExists()

  // Start codebuff
  const child = spawn(CONFIG.binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    cwd: process.cwd(),
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
