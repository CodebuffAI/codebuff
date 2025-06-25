#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const https = require('https')
const zlib = require('zlib')
const tar = require('tar')

// Hardcoded package name for codecane
const packageName = 'codecane'

function createConfig(packageName) {
  const homeDir = os.homedir()
  const configDir = path.join(homeDir, '.config', 'manicode')
  const binaryName = process.platform === 'win32' ? `${packageName}.exe` : packageName
  
  return {
    homeDir,
    configDir,
    binaryName,
    binaryPath: path.join(configDir, binaryName),
    githubRepo: 'CodebuffAI/codebuff-community',
    userAgent: `${packageName}-cli`,
    requestTimeout: 20000,
    isPrerelease: true, // codecane always looks for prereleases
  }
}

const CONFIG = createConfig(packageName)

// Platform target mapping
const PLATFORM_TARGETS = {
  'linux-x64': `${packageName}-linux-x64.tar.gz`,
  'linux-arm64': `${packageName}-linux-arm64.tar.gz`,
  'darwin-x64': `${packageName}-darwin-x64.tar.gz`,
  'darwin-arm64': `${packageName}-darwin-arm64.tar.gz`,
  'win32-x64': `${packageName}-win32-x64.tar.gz`,
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
      reject(new Error('Request timeout.'))
    })
  })
}

async function getLatestVersion() {
  try {
    const res = await httpGet(
      `https://github.com/${CONFIG.githubRepo}/releases.atom`
    )

    if (res.statusCode !== 200) return null

    const body = await streamToString(res)

    // Parse the Atom XML to extract releases
    const tagMatches = body.match(
      /<id>tag:github\.com,2008:Repository\/\d+\/([^<]+)<\/id>/g
    )

    if (!tagMatches) return null

    // Extract all version tags
    const versions = tagMatches
      .map((match) => {
        const tagMatch = match.match(
          /<id>tag:github\.com,2008:Repository\/\d+\/([^<]+)<\/id>/
        )
        return tagMatch ? tagMatch[1].replace(/^v/, '') : null
      })
      .filter(Boolean)

    if (versions.length === 0) return null

    // Filter versions based on whether we want prereleases or stable releases
    const filteredVersions = versions.filter((version) => {
      const isPrerelease = version.includes('-')
      return CONFIG.isPrerelease === isPrerelease
    })

    if (filteredVersions.length === 0) return null

    // Sort and return the latest version
    filteredVersions.sort(compareVersions)
    return filteredVersions[filteredVersions.length - 1]
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
    return new Promise((resolve, reject) => {
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

  // Compare main version parts
  for (let i = 0; i < Math.max(p1.main.length, p2.main.length); i++) {
    const n1 = p1.main[i] || 0
    const n2 = p2.main[i] || 0

    if (n1 < n2) return -1
    if (n1 > n2) return 1
  }

  // If main versions are equal, compare prerelease parts
  if (p1.prerelease.length === 0 && p2.prerelease.length === 0) {
    return 0 // No prerelease, versions are equal
  } else if (p1.prerelease.length === 0) {
    return 1 // v1 is a release, v2 is prerelease, so v1 > v2
  } else if (p2.prerelease.length === 0) {
    return -1 // v2 is a release, v1 is prerelease, so v1 < v2
  } else {
    // Both have prerelease parts, compare them
    for (
      let i = 0;
      i < Math.max(p1.prerelease.length, p2.prerelease.length);
      i++
    ) {
      const pr1 = p1.prerelease[i] || ''
      const pr2 = p2.prerelease[i] || ''

      // Handle numeric vs. string parts
      const isNum1 = !isNaN(parseInt(pr1))
      const isNum2 = !isNaN(parseInt(pr2))

      if (isNum1 && isNum2) {
        const num1 = parseInt(pr1)
        const num2 = parseInt(pr2)
        if (num1 < num2) return -1
        if (num1 > num2) return 1
      } else if (isNum1 && !isNum2) {
        return 1 // Numeric prerelease is generally higher than alpha/beta
      } else if (!isNum1 && isNum2) {
        return -1
      } else {
        // Lexicographical comparison for string parts
        if (pr1 < pr2) return -1
        if (pr1 > pr2) return 1
      }
    }
    return 0 // Prerelease parts are equal
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

  const downloadUrl = `https://github.com/${CONFIG.githubRepo}/releases/download/v${version}/${fileName}`

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
  console.log('Download complete! Starting Codecane...')
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
      console.error('Please check your internet connection and try again')
      process.exit(1)
    }
  }
}

async function checkForUpdates(runningProcess, exitListener) {
  try {
    const currentVersion = await getCurrentVersion()
    if (!currentVersion) return

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
      })

    // Find the extracted binary - it should be named "codecane" or "codecane.exe"
        }, 5000)
      console.log(`Update available: ${currentVersion} → ${latestVersion}`)

      await downloadBinary(latestVersion)

      // Restart with new binary - this replaces the current process
      const newChild = spawn(
        CONFIG.binaryPath,
        [packageName, ...process.argv.slice(2)],
        {
          stdio: 'inherit',
          detached: false,
        }
      )

      // Set up exit handler for the new process
      newChild.on('exit', (code) => {
        process.exit(code || 0)
      })
  } catch (error) {
      console.error('❌ Failed to download codecane:', error.message)

      // Don't return - keep this function running to maintain the wrapper
      return new Promise(() => {}) // Never resolves, keeps wrapper alive
    }
    // Silently ignore update check errors
  }
}

async function main() {
  await ensureBinaryExists()

  // Start the binary with codecane argument
  const child = spawn(
    CONFIG.binaryPath,
    [packageName, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
    }
  )

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
