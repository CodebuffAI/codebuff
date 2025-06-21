#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn, execSync } = require('child_process')
const https = require('https')

const homeDir = os.homedir()
const manicodeDir = path.join(homeDir, '.config', 'manicode')
const binaryName = process.platform === 'win32' ? 'codebuff.exe' : 'codebuff'
const binaryPath = path.join(manicodeDir, binaryName)

// Check if binary exists
if (!fs.existsSync(binaryPath)) {
  console.log('🔄 Codebuff binary not found. Downloading...')
  
  try {
    // Run the download script synchronously
    const downloadScript = path.join(__dirname, 'download-binary.js')
    execSync(`node "${downloadScript}"`, { stdio: 'inherit' })
  } catch (error) {
    console.error('❌ Failed to download codebuff binary')
    console.error('Please try running: npm install -g codebuff')
    process.exit(1)
  }
}

// Check if binary is executable (Unix only)
if (process.platform !== 'win32') {
  try {
    fs.accessSync(binaryPath, fs.constants.X_OK)
  } catch (error) {
    console.error(`❌ Codebuff binary is not executable: ${binaryPath}`)
    console.error('Please try running: npm install -g codebuff')
    process.exit(1)
  }
}

// Get current version from binary
function getCurrentVersion() {
  try {
    const result = execSync(`"${binaryPath}" --version`, { 
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 1000
    })
    return result.trim()
  } catch (error) {
    return null
  }
}

// Get latest version from GitHub releases
function getLatestVersionFromGitHub() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/CodebuffAI/codebuff-community/releases/latest',
      headers: {
        'User-Agent': 'codebuff-wrapper'
      }
    }

    const req = https.get(options, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const release = JSON.parse(data)
          const version = release.tag_name?.replace(/^v/, '') || null
          resolve(version)
        } catch (error) {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.setTimeout(5000, () => {
      req.destroy()
      resolve(null)
    })
  })
}

// Compare versions (returns true if version1 < version2)
function isVersionOlder(version1, version2) {
  if (!version1 || !version2) return false
  
  const v1Parts = version1.split('.').map(Number)
  const v2Parts = version2.split('.').map(Number)
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0
    const v2Part = v2Parts[i] || 0
    
    if (v1Part < v2Part) return true
    if (v1Part > v2Part) return false
  }
  
  return false
}

// Download and replace binary
async function downloadAndReplaceBinary() {
  console.log('🔄 Updating to latest version...')
  
  try {
    const downloadScript = path.join(__dirname, 'download-binary.js')
    
    // Remove existing binary first
    if (fs.existsSync(binaryPath)) {
      fs.unlinkSync(binaryPath)
    }
    
    // Download new binary
    execSync(`node "${downloadScript}"`, { stdio: 'inherit' })
    
    console.log('✅ Update complete!')
    return true
  } catch (error) {
    console.error('❌ Failed to update binary:', error.message)
    return false
  }
}

// Main execution
async function main() {
  // Start codebuff immediately
  const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    cwd: process.cwd()
  })

  // Check for updates in parallel (don't await)
  checkForUpdatesInBackground(child)

  child.on('exit', (code) => {
    process.exit(code || 0)
  })
}

async function checkForUpdatesInBackground(runningProcess) {
  try {
    const currentVersion = getCurrentVersion()
    if (!currentVersion) return

    const latestVersion = await getLatestVersionFromGitHub()
    if (!latestVersion) return

    if (isVersionOlder(currentVersion, latestVersion)) {
      // Kill the running process
      runningProcess.kill('SIGTERM')

      console.log('')

      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 500))

      console.log(`\n🔄 New version available: ${latestVersion} (current: ${currentVersion})`)
      
      
      // Download new version
      const success = await downloadAndReplaceBinary()
      
      if (success) {
        console.log('Restarting...\n')
        
        // Restart with new binary
        const newChild = spawn(binaryPath, process.argv.slice(2), {
          stdio: 'inherit',
          cwd: process.cwd()
        })
        
        newChild.on('exit', (code) => {
          process.exit(code || 0)
        })
      } else {
        // If update failed, restart with old binary
        console.log('⚠️  Update failed, continuing with current version...\n')
        const fallbackChild = spawn(binaryPath, process.argv.slice(2), {
          stdio: 'inherit',
          cwd: process.cwd()
        })
        
        fallbackChild.on('exit', (code) => {
          process.exit(code || 0)
        })
      }
    }
  } catch (error) {
    // Silently ignore update check errors to avoid disrupting user experience
  }
}

main()
