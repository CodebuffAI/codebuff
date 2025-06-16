#!/usr/bin/env node
/**
 * fetch-external-binaries.js
 *
 * Download external binaries (PTY and ripgrep) from GitHub releases
 * and save them to our local binaries directory for bundling in compiled binaries.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'

// Binary configurations
const BINARIES = {
  pty: {
    version: '0.12.0',
    repo: 'homebridge/node-pty-prebuilt-multiarch',
    targets: [
      { platform: 'darwin', arch: 'x64', nodeAbi: '127' },
      { platform: 'darwin', arch: 'arm64', nodeAbi: '127' },
      { platform: 'win32', arch: 'x64', nodeAbi: '127' },
      { platform: 'linux', arch: 'x64', nodeAbi: '127' },
      { platform: 'linux', arch: 'arm64', nodeAbi: '127' },
    ],
    getUrl: (version, platform, arch, nodeAbi) => {
      const platformMap = { darwin: 'darwin', win32: 'win32', linux: 'linux' }
      const archMap = { x64: 'x64', arm64: 'arm64' }
      return `https://github.com/homebridge/node-pty-prebuilt-multiarch/releases/download/v${version}/node-pty-prebuilt-multiarch-v${version}-node-v${nodeAbi}-${platformMap[platform]}-${archMap[arch]}.tar.gz`
    },
    getFileName: () => 'node.abi127.node',
    extract: async (targetDir, archivePath) => {
      execSync(
        `cd "${targetDir}" && tar -xzf binary.tar.gz && rm binary.tar.gz`,
        { stdio: 'pipe' }
      )
      const extractedFiles = execSync(`find "${targetDir}" -name "*.node"`, {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .filter(Boolean)
      return extractedFiles[0]
    },
  },
  ripgrep: {
    version: '13.0.0-13',
    repo: 'microsoft/ripgrep-prebuilt',
    targets: [
      { platform: 'darwin', arch: 'x64', target: 'x86_64-apple-darwin' },
      { platform: 'darwin', arch: 'arm64', target: 'aarch64-apple-darwin' },
      { platform: 'win32', arch: 'x64', target: 'x86_64-pc-windows-msvc' },
      { platform: 'linux', arch: 'x64', target: 'x86_64-unknown-linux-musl' },
      { platform: 'linux', arch: 'arm64', target: 'aarch64-unknown-linux-gnu' },
    ],
    getUrl: (version, platform, arch, target) => {
      const extension = platform === 'win32' ? 'zip' : 'tar.gz'
      return `https://github.com/microsoft/ripgrep-prebuilt/releases/download/v${version}/ripgrep-v${version}-${target}.${extension}`
    },
    getFileName: (platform) => (platform === 'win32' ? 'rg.exe' : 'rg'),
    extract: async (targetDir, archivePath, platform, binaryName) => {
      if (platform === 'win32') {
        execSync(
          `cd "${targetDir}" && unzip -q ripgrep.zip && rm ripgrep.zip`,
          { stdio: 'pipe' }
        )
      } else {
        execSync(
          `cd "${targetDir}" && tar -xzf ripgrep.tar.gz && rm ripgrep.tar.gz`,
          { stdio: 'pipe' }
        )
      }
      const extractedFiles = execSync(
        `find "${targetDir}" -name "${binaryName}" -type f`,
        { encoding: 'utf8' }
      )
        .trim()
        .split('\n')
        .filter(Boolean)
      return extractedFiles[0]
    },
  },
}

async function downloadBinary(binaryType, config, target) {
  const { platform, arch } = target
  
  if (binaryType === 'pty') {
    // Download to @homebridge package prebuilds directory (root node_modules for bun workspaces)
    const homebridgeDir = resolve('..', 'node_modules', '@homebridge', 'node-pty-prebuilt-multiarch', 'prebuilds')
    const platformDir = platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'win32' : 'linux'
    const archDir = arch === 'x64' ? 'x64' : 'arm64'
    const targetDir = join(homebridgeDir, `${platformDir}-${archDir}`)
    const fileName = config.getFileName(platform, target)
    const targetPath = join(targetDir, fileName)
    
    // Check if file already exists
    if (fs.existsSync(targetPath)) {
      console.log(`✅ ${binaryType} ${platform}/${arch}`)
      return true
    }

    mkdirSync(targetDir, { recursive: true })

    try {
      process.stdout.write(`⬇️  ${binaryType} ${platform}/${arch}... `)

      // Get download URL
      const url = config.getUrl(config.version, platform, arch, target.nodeAbi)

      // Download the archive
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const archivePath = join(targetDir, 'binary.tar.gz')
      await pipeline(response.body, createWriteStream(archivePath))

      // Extract the binary
      const sourcePath = await config.extract(targetDir, archivePath)

      if (sourcePath) {
        execSync(`mv "${sourcePath}" "${targetPath}"`)

        // Make executable on Unix systems
        if (platform !== 'win32') {
          execSync(`chmod +x "${targetPath}"`)
        }

        // Clean up any remaining extracted directories
        execSync(
          `find "${targetDir}" -type d -not -path "${targetDir}" -exec rm -rf {} + 2>/dev/null || true`
        )

        console.log('✅')
        return true
      } else {
        throw new Error(`No ${fileName} binary found in extracted archive`)
      }
    } catch (error) {
      console.log(`❌ ${error.message}`)
      return false
    }
  } else {
    // Keep ripgrep in bin-external as before
    const binariesDir = resolve('bin-external', binaryType)
    mkdirSync(binariesDir, { recursive: true })

    const targetDir = join(binariesDir, `${platform}-${arch}`)
    const fileName = config.getFileName(platform, target)
    const targetPath = join(targetDir, fileName)

    // Check if file already exists
    if (fs.existsSync(targetPath)) {
      console.log(`✅ ${binaryType} ${platform}/${arch}`)
      return true
    }

    mkdirSync(targetDir, { recursive: true })

    try {
      process.stdout.write(`⬇️  ${binaryType} ${platform}/${arch}... `)

      // Get download URL
      const url =
        binaryType === 'pty'
          ? config.getUrl(config.version, platform, arch, target.nodeAbi)
          : config.getUrl(config.version, platform, arch, target.target)

      // Download the archive
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const archiveName =
        binaryType === 'pty'
          ? 'binary.tar.gz'
          : platform === 'win32'
            ? 'ripgrep.zip'
            : 'ripgrep.tar.gz'
      const archivePath = join(targetDir, archiveName)

      await pipeline(response.body, createWriteStream(archivePath))

      // Extract the binary
      const sourcePath = await config.extract(
        targetDir,
        archivePath,
        platform,
        fileName
      )

      if (sourcePath) {
        execSync(`mv "${sourcePath}" "${targetPath}"`)

        // Make executable on Unix systems
        if (platform !== 'win32') {
          execSync(`chmod +x "${targetPath}"`)
        }

        // Clean up any remaining extracted directories
        execSync(
          `find "${targetDir}" -type d -not -path "${targetDir}" -exec rm -rf {} + 2>/dev/null || true`
        )

        console.log('✅')
        return true
      } else {
        throw new Error(`No ${fileName} binary found in extracted archive`)
      }
    } catch (error) {
      console.log(`❌ ${error.message}`)
      return false
    }
  }
}

// Main execution
async function main() {
  console.log('⬇️  Fetching external binaries...')

  for (const [binaryType, config] of Object.entries(BINARIES)) {
    for (const target of config.targets) {
      await downloadBinary(binaryType, config, target)
    }
  }
}

main().catch((error) => {
  console.error('Failed to fetch external binaries:', error)
  process.exit(1)
})
