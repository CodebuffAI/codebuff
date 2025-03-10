import { spawn, execSync } from 'child_process'
import { green, yellow } from 'picocolors'
import { scrapeWebPage } from './web-scraper'
import packageJson from '../package.json'
import { isProduction } from './config'

export async function updateCodebuff() {
  if (!isProduction) return

  const latestVersion = await getCodecaneNpmVersion()
  const isUpToDate = isNpmUpToDate(packageJson.version, latestVersion)
  if (!isUpToDate) {
    const installerInfo = detectInstaller()
    if (!installerInfo) {
      console.log(
        yellow(
          "There's a new version available! Please update Codecane to prevent errors (run `npm install -g codecane` to update)."
        )
      )
      return
    }
    console.log(green(`Updating Codecane using ${installerInfo.installer}...`))
    try {
      runUpdateCodecane(installerInfo)
      console.log(green('Codecane updated successfully.'))
      console.log(
        green('Please restart by running `codecane` to use the new version.')
      )
      process.exit(0)
    } catch (error) {
      console.error('Failed to update Codecane.')
    }
  }
}

async function getCodecaneNpmVersion() {
  try {
    const result = execSync('npm view codecane version', {
      encoding: 'utf-8',
      stdio: 'pipe', // Suppress all output
    })
    const versionMatch = result.match(/(\d+\.\d+\.\d+)/)
    if (versionMatch) {
      return versionMatch[1]
    }
  } catch (error) {}
  // Fallback to web scraping if npm command fails
  const url = 'https://www.npmjs.com/package/codecane'
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
  let codecaneLocation = ''
  try {
    if (process.platform === 'win32') {
      codecaneLocation = execSync('where codecane').toString().trim()
    } else {
      codecaneLocation = execSync('which codecane').toString().trim()
    }
  } catch (error) {
    // Continue with empty location - could be a local installation
  }

  const binPath = (codecaneLocation.split('\n')[0] ?? '').replace(/\\/g, '/')
  const npmUserAgent = process.env.npm_config_user_agent ?? ''

  // Check for package manager script environments
  const isYarnScript = process.env.npm_lifecycle_script?.includes('yarn')
  const isPnpmScript = process.env.npm_lifecycle_script?.includes('pnpm')
  const isBunScript = process.env.npm_lifecycle_script?.includes('bun')
  const isNpmScript =
    process.env.npm_execpath?.endsWith('npm-cli.js') ||
    npmUserAgent.includes('npm')

  // Mac: /Users/jahooma/.yarn/bin/codecane
  if (isYarnScript || binPath.includes('.yarn')) {
    return {
      installer: 'yarn',
      scope: binPath.includes('.yarn') ? 'global' : 'local',
    }
  }

  // Windows: ~/AppData/Local/pnpm/store
  // macOS: ~/Library/pnpm/store
  // Linux: ~/.local/share/pnpm/store
  if (isPnpmScript || binPath.includes('pnpm')) {
    return {
      installer: 'pnpm',
      scope: binPath.includes('pnpm') ? 'global' : 'local',
    }
  }

  // Mac: /Users/jahooma/.bun/install/cache
  if (isBunScript || binPath.includes('.bun')) {
    return {
      installer: 'bun',
      scope: binPath.includes('.bun') ? 'global' : 'local',
    }
  }

  // /usr/local/lib/node_modules on macOS/Linux or %AppData%\npm/node_modules on Windows
  // OR: .nvm/versions/node/v18.17.0/bin/codecane on mac
  // OR /Users/stefan/Library/Application Support/Herd/config/nvm/versions/node/v22.9.0/bin/codecane
  // OR ~/.config/nvm/versions/node/v22.11.0/bin/codecane
  // OR /opt/homebrew/bin/codecane
  const isGlobalNpmPath =
    binPath.includes('npm') ||
    binPath.startsWith('/usr/') ||
    binPath.includes('nvm/') ||
    binPath.includes('homebrew/bin')
  if (isNpmScript || isGlobalNpmPath) {
    return {
      installer: 'npm',
      scope: isGlobalNpmPath ? 'global' : 'local',
    }
  }

  return undefined
}

function runUpdateCodecane(installerInfo: InstallerInfo) {
  let command: string
  const isGlobal = installerInfo.scope === 'global'

  switch (installerInfo.installer) {
    case 'npm':
      command = `npm ${isGlobal ? 'install -g' : 'install'} codecane@latest`
      break
    case 'yarn':
      command = `yarn ${isGlobal ? 'global add' : 'add'} codecane@latest`
      break
    case 'pnpm':
      command = `pnpm add ${isGlobal ? '-g' : ''} codecane@latest`
      break
    case 'bun':
      command = `bun add ${isGlobal ? '-g' : ''} codecane@latest`
      break
    default:
      throw new Error(
        `Unsupported installer: ${installerInfo.installer} ${installerInfo.scope}`
      )
  }

  execSync(command, { stdio: 'inherit' })
}

function restartCodecane() {
  const child = spawn('codecane', [...process.argv.slice(2), '--post-update'], {
    detached: false,
    stdio: 'inherit',
  })
  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })
}
