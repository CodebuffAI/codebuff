#!/usr/bin/env node

const https = require('https')
const fs = require('fs')
const path = require('path')
const { platform, arch } = process
const packageJson = require('../package.json')
const ver = packageJson.version

const targets = {
  'linux-x64': 'codebuff-linux-x64.tar.gz',
  'linux-arm64': 'codebuff-linux-arm64.tar.gz',
  'darwin-x64': 'codebuff-darwin-x64.tar.gz', 
  'darwin-arm64': 'codebuff-darwin-arm64.tar.gz',
  'win32-x64': 'codebuff-win32-x64.zip'
}

const key = `${platform}-${arch}`
const file = targets[key]

if (!file) {
  console.error(`❌ Unsupported platform: ${platform} ${arch}`)
  console.error('Supported platforms:', Object.keys(targets).join(', '))
  process.exit(1)
}

const url = `https://github.com/CodebuffAI/codebuff/releases/download/v${ver}/${file}`
const binDir = path.join(__dirname, '..', 'bin')

// Create bin directory
fs.mkdirSync(binDir, { recursive: true })

console.log(`⬇️  Downloading ${file} from GitHub releases...`)

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

  if (file.endsWith('.zip')) {
    // Handle zip files (Windows)
    const zipPath = path.join(binDir, file)
    const writeStream = fs.createWriteStream(zipPath)
    
    res.pipe(writeStream)
    
    writeStream.on('finish', () => {
      // Extract zip file
      const { execSync } = require('child_process')
      try {
        execSync(`cd "${binDir}" && unzip -o "${file}"`, { stdio: 'inherit' })
        fs.unlinkSync(zipPath) // Clean up zip file
        console.log('✅ codebuff installed')
      } catch (error) {
        console.error('❌ Failed to extract zip:', error.message)
        process.exit(1)
      }
    })
  } else {
    // Handle tar.gz files (Unix)
    const zlib = require('zlib')
    const tar = require('tar')
    
    res.pipe(zlib.createGunzip())
       .pipe(tar.extract({ cwd: binDir }))
       .on('finish', () => {
         // Make executable
         const binaryName = platform === 'win32' ? 'codebuff.exe' : 'codebuff'
         const binaryPath = path.join(binDir, binaryName)
         if (fs.existsSync(binaryPath)) {
           fs.chmodSync(binaryPath, 0o755)
         }
         console.log('✅ codebuff installed')
       })
       .on('error', (err) => {
         console.error(`❌ Extraction failed: ${err.message}`)
         process.exit(1)
       })
  }
}
