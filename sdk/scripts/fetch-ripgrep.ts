#!/usr/bin/env bun

import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import fetch from 'node-fetch'

// Ripgrep version to download
const RIPGREP_VERSION = '14.1.1'

// Platform configurations
const PLATFORMS = [
  {
    name: 'x64-win32',
    url: `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-x86_64-pc-windows-msvc.zip`,
    executable: 'rg.exe',
    archivePath: `ripgrep-${RIPGREP_VERSION}-x86_64-pc-windows-msvc/rg.exe`,
  },
  {
    name: 'x64-darwin',
    url: `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-x86_64-apple-darwin.tar.gz`,
    executable: 'rg',
    archivePath: `ripgrep-${RIPGREP_VERSION}-x86_64-apple-darwin/rg`,
  },
  {
    name: 'arm64-darwin',
    url: `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-aarch64-apple-darwin.tar.gz`,
    executable: 'rg',
    archivePath: `ripgrep-${RIPGREP_VERSION}-aarch64-apple-darwin/rg`,
  },
  {
    name: 'x64-linux',
    url: `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl.tar.gz`,
    executable: 'rg',
    archivePath: `ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl/rg`,
  },
  {
    name: 'arm64-linux',
    url: `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
    executable: 'rg',
    archivePath: `ripgrep-${RIPGREP_VERSION}-aarch64-unknown-linux-gnu/rg`,
  },
]

async function downloadAndExtract(
  platform: (typeof PLATFORMS)[0],
): Promise<void> {
  const vendorDir = join('vendor', 'ripgrep', platform.name)
  const outputPath = join(vendorDir, platform.executable)

  // Skip if already exists
  if (existsSync(outputPath)) {
    console.log(`✓ ${platform.name} already exists, skipping`)
    return
  }

  console.log(`📥 Downloading ${platform.name}...`)

  const response = await fetch(platform.url)
  if (!response.ok) {
    throw new Error(
      `Failed to download ${platform.url}: ${response.statusText}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Create vendor directory
  await mkdir(vendorDir, { recursive: true })

  if (platform.url.endsWith('.zip')) {
    // Handle ZIP files
    const zip = AdmZip(buffer)
    const entry = zip.getEntry(platform.archivePath)
    if (!entry) {
      throw new Error(`Could not find ${platform.archivePath} in archive`)
    }
    await writeFile(outputPath, entry.getData())
  } else {
    // Handle tar.gz files
    const { spawn } = require('child_process')
    const tempFile = join(vendorDir, 'temp.tar.gz')

    // Write temp file
    await writeFile(tempFile, buffer)

    // Extract using tar
    await new Promise<void>((resolve, reject) => {
      const tar = spawn(
        'tar',
        [
          '-xzf',
          tempFile,
          '-C',
          vendorDir,
          '--strip-components=1',
          platform.archivePath,
        ],
        {
          stdio: 'inherit',
        },
      )

      tar.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`tar extraction failed with code ${code}`))
        }
      })

      tar.on('error', reject)
    })

    // Clean up temp file
    try {
      await Bun.file(tempFile).delete()
    } catch {}
  }

  // Make executable on Unix systems
  if (platform.executable === 'rg') {
    const { spawn } = require('child_process')
    await new Promise<void>((resolve, reject) => {
      const chmod = spawn('chmod', ['+x', outputPath])
      chmod.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`chmod failed with code ${code}`))
        }
      })
      chmod.on('error', reject)
    })
  }

  console.log(`✓ ${platform.name} downloaded and extracted`)
}

async function main() {
  console.log(`🔧 Fetching ripgrep v${RIPGREP_VERSION} binaries...`)

  // Create base vendor directory
  await mkdir(join('vendor', 'ripgrep'), { recursive: true })

  // Download all platforms in parallel
  await Promise.all(PLATFORMS.map(downloadAndExtract))

  // Copy COPYING file
  console.log('📄 Downloading COPYING file...')
  const copyingResponse = await fetch(
    `https://raw.githubusercontent.com/BurntSushi/ripgrep/main/COPYING`,
  )
  if (copyingResponse.ok) {
    const copyingText = await copyingResponse.text()
    await writeFile(join('vendor', 'ripgrep', 'COPYING'), copyingText)
    console.log('✓ COPYING file downloaded')
  }

  console.log('🎉 All ripgrep binaries downloaded successfully!')
  console.log('📁 Files are located in vendor/ripgrep/')
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ Error:', error.message)
    process.exit(1)
  })
}
