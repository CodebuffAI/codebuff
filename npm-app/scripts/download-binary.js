#!/usr/bin/env node

const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { platform, arch } = process

// Get latest version from GitHub releases
function getLatestVersionFromGitHub() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/CodebuffAI/codebuff-community/releases/latest',
      headers: {
        'User-Agent': 'codebuff-download'
      }
    }

    const req = https.get(options, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const release = JSON.parse(data)
          const version = release.tag_name?.replace(/^v/, '')
          if (version) {
            resolve(version)
          } else {
            reject(new Error('No version found in release'))
          }
        } catch (error) {
          reject(error)
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

async function main() {
  // Get version from GitHub releases
  let version
  try {
    version = await getLatestVersionFromGitHub()
  } catch (error) {
    // Fallback to package.json version if GitHub API fails
    try {
      const packageJsonPath = path.join(__dirname, '..', 'package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      version = packageJson.version
    } catch (fallbackError) {
      console.error('❌ Could not determine version to download')
      process.exit(1)
    }
  }

  const targets = {
    'linux-x64': 'codebuff-linux-x64.tar.gz',
    'linux-arm64': 'codebuff-linux-arm64.tar.gz',
    'darwin-x64': 'codebuff-darwin-x64.tar.gz',
    'darwin-arm64': 'codebuff-darwin-arm64.tar.gz',
    'win32-x64': 'codebuff-win32-x64.zip',
  }

  const key = `${platform}-${arch}`
  const file = targets[key]

  if (!file) {
    console.error(`❌ Unsupported platform: ${platform} ${arch}`)
    console.error('Supported platforms:', Object.keys(targets).join(', '))
    process.exit(1)
  }

  const url = `https://github.com/CodebuffAI/codebuff-community/releases/download/v${version}/${file}`
  const homeDir = os.homedir()
  const manicodeDir = path.join(homeDir, '.config', 'manicode')
  const binaryName = platform === 'win32' ? 'codebuff.exe' : 'codebuff'
  const binaryPath = path.join(manicodeDir, binaryName)

  // Create .config/manicode directory
  fs.mkdirSync(manicodeDir, { recursive: true })

  console.log(`Downloading v${version}...`)

  const request = https.get(url, (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) {
      // Follow redirect
      return https.get(res.headers.location, handleResponse)
    }
    handleResponse(res)
  })

  request.on('error', (err) => {
    console.error(`❌ Download failed: ${err.message}`)
    process.exit(1)
  })

  function handleResponse(res) {
    if (res.statusCode !== 200) {
      console.error(`❌ Download failed: HTTP ${res.statusCode}`)
      console.error(`URL: ${url}`)
      process.exit(1)
    }

    const totalSize = parseInt(res.headers['content-length'] || '0', 10)
    let downloadedSize = 0
    let lastProgressTime = Date.now()

    // Show progress for downloads
    const showProgress = (downloaded, total) => {
      const now = Date.now()
      // Update progress every 100ms to avoid too frequent updates
      if (now - lastProgressTime < 100 && downloaded < total) return
      lastProgressTime = now

      if (total > 0) {
        const percentage = Math.round((downloaded / total) * 100)
        const downloadedMB = (downloaded / 1024 / 1024).toFixed(1)
        const totalMB = (total / 1024 / 1024).toFixed(1)
        process.stderr.write(
          `\r${percentage}%`
        )
      } else {
        const downloadedMB = (downloaded / 1024 / 1024).toFixed(1)
        process.stderr.write(`\r${downloadedMB}MB`)
      }
    }

    res.on('data', (chunk) => {
      downloadedSize += chunk.length
      showProgress(downloadedSize, totalSize)
    })

    if (file.endsWith('.zip')) {
      // Handle zip files (Windows) - use Node.js built-in modules instead of unzip command
      const zipPath = path.join(manicodeDir, file)
      const writeStream = fs.createWriteStream(zipPath)

      res.pipe(writeStream)

      writeStream.on('finish', () => {
        process.stderr.write('\n') // New line after progress
        console.log('Extracting...')
        
        try {
          // Use Node.js built-in modules for ZIP extraction
          const AdmZip = require('adm-zip')
          const zip = new AdmZip(zipPath)
          zip.extractAllTo(manicodeDir, true)
          
          // Clean up zip file
          fs.unlinkSync(zipPath)
          
          // The extracted binary will have the platform/arch in the name
          const extractedBinaryName = file
            .replace('.tar.gz', '')
            .replace('.zip', '')
          const finalBinaryName =
            platform === 'win32' ? 'codebuff.exe' : 'codebuff'
          const extractedBinaryPath = path.join(manicodeDir, extractedBinaryName)
          const finalBinaryPath = path.join(manicodeDir, finalBinaryName)

          if (fs.existsSync(extractedBinaryPath)) {
            // Rename to the standard name
            fs.renameSync(extractedBinaryPath, finalBinaryPath)
          } else {
            console.error(`❌ Binary not found at ${extractedBinaryPath}`)
            process.exit(1)
          }
        } catch (error) {
          console.error('❌ Failed to extract zip:', error.message)
          process.exit(1)
        }
      })
    } else {
      // Handle tar.gz files (Unix)
      const zlib = require('zlib')
      const tar = require('tar')

      res
        .pipe(zlib.createGunzip())
        .pipe(tar.extract({ cwd: manicodeDir }))
        .on('finish', () => {
          process.stderr.write('\n') // New line after progress
          // The extracted binary will have the platform/arch in the name
          const extractedBinaryName = file
            .replace('.tar.gz', '')
            .replace('.zip', '')
          const finalBinaryName =
            platform === 'win32' ? 'codebuff.exe' : 'codebuff'
          const extractedBinaryPath = path.join(manicodeDir, extractedBinaryName)
          const finalBinaryPath = path.join(manicodeDir, finalBinaryName)

          if (fs.existsSync(extractedBinaryPath)) {
            fs.chmodSync(extractedBinaryPath, 0o755)
            // Rename to the standard name
            fs.renameSync(extractedBinaryPath, finalBinaryPath)
          } else {
            console.error(`❌ Binary not found at ${extractedBinaryPath}`)
            process.exit(1)
          }
        })
        .on('error', (err) => {
          console.error(`❌ Extraction failed: ${err.message}`)
          process.exit(1)
        })
    }
  }
}

main()
