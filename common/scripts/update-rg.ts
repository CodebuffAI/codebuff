import { $ } from 'bun'
import path from 'node:path'

// Platforms to support
const platforms = [
  { key: 'darwin-x64', urlPattern: 'x86_64-apple-darwin', ext: 'tar.gz', exe: '' },
  { key: 'darwin-arm64', urlPattern: 'aarch64-apple-darwin', ext: 'tar.gz', exe: '' },
  { key: 'linux-x64', urlPattern: 'x86_64-unknown-linux-gnu', ext: 'tar.gz', exe: '' },
  { key: 'linux-arm64', urlPattern: 'aarch64-unknown-linux-gnu', ext: 'tar.gz', exe: '' },
  { key: 'win32-x64', urlPattern: 'x86_64-pc-windows-msvc', ext: 'zip', exe: '.exe' },
  { key: 'win32-arm64', urlPattern: 'aarch64-pc-windows-msvc', ext: 'zip', exe: '.exe' },
]

const baseDir = path.join(process.cwd(), 'bin', 'ripgrep')

async function main() {
  try {
    // Fetch latest release
    const response = await fetch('https://api.github.com/repos/BurntSushi/ripgrep/releases/latest')
    if (!response.ok) {
      throw new Error(`Failed to fetch release: ${response.status}`)
    }
    const release = await response.json()
    const version = release.tag_name.replace(/^v/, '')
    console.log(`Latest ripgrep version: ${version}`)

    for (const plat of platforms) {
      const assetName = `ripgrep-${version}-${plat.urlPattern}${plat.ext === 'zip' ? '' : '.tar.gz'}`
      const asset = release.assets.find((a: any) => a.name === assetName)
      if (!asset) {
        console.warn(`Asset not found for ${plat.key}: ${assetName}`)
        continue
      }

      const downloadUrl = asset.browser_download_url
      const dir = path.join(baseDir, plat.key)
      const outputFile = path.join(dir, `rg${plat.exe}`)
      const archiveFile = path.join(dir, `archive.${plat.ext}`)

      // Create dir
      await $`mkdir -p ${dir}`

      // Download
      console.log(`Downloading ${plat.key}...`)
      await $`curl -L -o ${archiveFile} ${downloadUrl}`

      // Extract
      if (plat.ext === 'tar.gz') {
        await $`tar -xzf ${archiveFile} --strip-components=1 -C ${dir} rg`
        await $`mv ${dir}/rg ${outputFile}`
      } else {
        await $`unzip -j ${archiveFile} rg.exe -d ${dir}`
        await $`mv ${dir}/rg.exe ${outputFile}`
      }

      // Cleanup
      await $`rm ${archiveFile}`

      // Make executable
      if (!plat.exe) {
        await $`chmod +x ${outputFile}`
      }

      console.log(`Extracted ${plat.key} to ${outputFile}`)
    }

    console.log('Update complete!')
  } catch (error) {
    console.error('Update failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)