import { spawn, execSync } from 'child_process'
import { green, yellow } from 'picocolors'
import { scrapeWebPage } from './web-scraper'
import packageJson from '../package.json'

export async function updateManicode() {
  const latestVersion = await getManicodeNpmVersion()
  const isUpToDate = isNpmUpToDate(packageJson.version, latestVersion)
  if (!isUpToDate) {
    const installer = detectInstaller()
    if (!installer) {
      console.log(
        yellow(
          "There's a new version available! Please update manicode to prevent errors"
        )
      )
      return
    }
    console.log(green(`Updating Manicode using ${installer}...`))
    try {
      runUpdateManicode(installer)
      console.log(green('Manicode updated successfully.'))
      console.log(green('Goodbyeeeee! Please restart Manicode to use the new version.'))
      process.exit(0)
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

function detectInstaller(): 'npm' | 'yarn' | 'pnpm' | 'bun' | undefined {
  const result = execSync('which manicode')
  const path = result.toString().trim()

  const pathIncludesNodeModules = path.includes('node_modules')

  // Mac: /Users/jahooma/.yarn/bin/manicode
  if (path.includes('.yarn') && !pathIncludesNodeModules) {
    return 'yarn'
  }

  // Windows: ~/AppData/Local/pnpm/store
  // macOS: ~/Library/pnpm/store
  // Linux: ~/.local/share/pnpm/store
  if (path.includes('pnpm') && !pathIncludesNodeModules) {
    return 'pnpm'
  }

  // Mac: /Users/jahooma/.bun/install/cache
  if (path.includes('.bun') && !pathIncludesNodeModules) {
    return 'bun'
  }

  // /usr/local/lib/node_modules on macOS/Linux or %AppData%\npm/node_modules on Windows
  if (
    pathIncludesNodeModules &&
    (path.includes('npm') || path.startsWith('/usr/'))
  ) {
    return 'npm'
  }

  return undefined
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

function restartManicode() {
  const child = spawn('manicode', [...process.argv.slice(2), '--post-update'], {
    detached: false,
    stdio: 'inherit',
  })
  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })
}
