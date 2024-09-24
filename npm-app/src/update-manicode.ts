import { execSync } from 'child_process'
import { green } from 'picocolors'
import { scrapeWebPage } from './web-scraper'
import packageJson from '../package.json'

export async function updateManicode() {
  const latestVersion = await getManicodeNpmVersion()
  const isUpToDate = isNpmUpToDate(packageJson.version, latestVersion)
  if (!isUpToDate) {
    const installer = detectInstaller()
    console.log(green(`Updating Manicode using ${installer}...`))
    try {
      runUpdateManicode(installer)
      console.log(green('Manicode updated successfully!'))
      console.log(green('Please restart Manicode to use the new version.'))
    } catch (error) {
      console.error('Failed to update Manicode.')
    }
  }
}

async function getManicodeNpmVersion() {
  const url = 'https://www.npmjs.com/package/manicode'
  const content = await scrapeWebPage(url)

  const latestVersionRegex = /"latest":"(\d+\.\d+\.\d+)"/
  const match = content.match(latestVersionRegex)
  return match ? match[1] : ''
}

function isNpmUpToDate(currentVersion: string, latestVersion: string) {
  const current = currentVersion.split('.').map(Number)
  const latest = latestVersion.split('.').map(Number)

  for (let i = 0; i < 3; i++) {
    if (current[i] < latest[i]) return false
    if (current[i] > latest[i]) return true
  }

  return true
}

function detectInstaller(): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  const { execPath } = process

  if (execPath.includes('yarn')) {
    return 'yarn'
  }
  if (execPath.includes('pnpm')) {
    return 'pnpm'
  }
  if (execPath.includes('bun')) {
    return 'bun'
  }
  return 'npm'
}

function runUpdateManicode(installer: 'npm' | 'yarn' | 'pnpm' | 'bun') {
  let command: string
  switch (installer) {
    case 'npm':
      command = 'npm install -g manicode@latest'
      break
    case 'yarn':
      command = 'yarn global add manicode@latest'
      break
    case 'pnpm':
      command = 'pnpm add -g manicode@latest'
      break
    case 'bun':
      command = 'bun add -g manicode@latest'
      break
    default:
      throw new Error(`Unsupported installer: ${installer}`)
  }

  execSync(command, { stdio: 'inherit' })
}
