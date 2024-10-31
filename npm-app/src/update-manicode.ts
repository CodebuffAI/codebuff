import { spawn, execSync } from 'child_process'
import { green, yellow } from 'picocolors'
import { scrapeWebPage } from './web-scraper'
import packageJson from '../package.json'
import { isProduction } from './config'

export async function updateManicode() {
  if (!isProduction) return

  const latestVersion = await getManicodeNpmVersion()
  const isUpToDate = isNpmUpToDate(packageJson.version, latestVersion)
  if (!isUpToDate) {
    const installerInfo = detectInstaller()
    if (!installerInfo) {
      console.log(
        yellow(
          "There's a new version available! Please update manicode to prevent errors"
        )
      )
      return
    }
    console.log(green(`Updating Manicode using ${installerInfo.installer}...`))
    try {
      runUpdateManicode(installerInfo)
      console.log(green('Manicode updated successfully.'))
      console.log(
        green('Manicode out! Please restart Manicode to use the new version.')
      )
      process.exit(0)
    } catch (error) {
      console.error('Failed to update Manicode.')
    }
  }
}

async function getManicodeNpmVersion() {
  try {
    const result = execSync('npm view manicode version', {
      encoding: 'utf-8',
      stdio: 'pipe', // Suppress all output
    })
    const versionMatch = result.match(/(\d+\.\d+\.\d+)/)
    if (versionMatch) {
      return versionMatch[1]
    }
  } catch (error) {}
  // Fallback to web scraping if npm command fails
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

type InstallerInfo = {
  installer: 'npm' | 'yarn' | 'pnpm' | 'bun'
  scope: 'global' | 'local'
}

function detectInstaller(): InstallerInfo | undefined {
  let manicodeLocation = ''
  try {
    if (process.platform === 'win32') {
      manicodeLocation = execSync('where manicode').toString().trim()
    } else {
      manicodeLocation = execSync('which manicode').toString().trim()
    }
  } catch (error) {
    // Continue with empty location - could be a local installation
  }

  const path = manicodeLocation.split('\n')[0] ?? ''
  const pathIncludesNodeModules = path.includes('node_modules')
  const npmUserAgent = process.env.npm_config_user_agent ?? ''

  // Check for package manager script environments
  const isYarnScript = process.env.npm_lifecycle_script?.includes('yarn')
  const isPnpmScript = process.env.npm_lifecycle_script?.includes('pnpm')
  const isBunScript = process.env.npm_lifecycle_script?.includes('bun')
  const isNpmScript =
    process.env.npm_execpath?.endsWith('npm-cli.js') ||
    npmUserAgent.includes('npm')

  // Mac: /Users/jahooma/.yarn/bin/manicode
  if (isYarnScript || path.includes('.yarn')) {
    return {
      installer: 'yarn',
      scope: path.includes('.yarn') ? 'global' : 'local',
    }
  }

  // Windows: ~/AppData/Local/pnpm/store
  // macOS: ~/Library/pnpm/store
  // Linux: ~/.local/share/pnpm/store
  if (isPnpmScript || path.includes('pnpm')) {
    return {
      installer: 'pnpm',
      scope: path.includes('pnpm') ? 'global' : 'local',
    }
  }

  // Mac: /Users/jahooma/.bun/install/cache
  if (isBunScript || path.includes('.bun')) {
    return {
      installer: 'bun',
      scope: path.includes('.bun') ? 'global' : 'local',
    }
  }

  // /usr/local/lib/node_modules on macOS/Linux or %AppData%\npm/node_modules on Windows
  // OR: .nvm/versions/node/v18.17.0/bin/manicode on mac
  const isGlobalNpmPath =
    path.includes('npm') || path.startsWith('/usr/') || path.includes('.nvm')
  if (isNpmScript || isGlobalNpmPath) {
    return {
      installer: 'npm',
      scope: isGlobalNpmPath ? 'global' : 'local',
    }
  }

  return undefined
}

function runUpdateManicode(installerInfo: InstallerInfo) {
  let command: string
  const isGlobal = installerInfo.scope === 'global'

  switch (installerInfo.installer) {
    case 'npm':
      command = `npm ${isGlobal ? 'install -g' : 'install'} manicode@latest`
      break
    case 'yarn':
      command = `yarn ${isGlobal ? 'global add' : 'add'} manicode@latest`
      break
    case 'pnpm':
      command = `pnpm add ${isGlobal ? '-g' : ''} manicode@latest`
      break
    case 'bun':
      command = `bun add ${isGlobal ? '-g' : ''} manicode@latest`
      break
    default:
      throw new Error(
        `Unsupported installer: ${installerInfo.installer} ${installerInfo.scope}`
      )
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
