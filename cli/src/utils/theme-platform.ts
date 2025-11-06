import { execSync } from 'child_process'

import type { ThemeName } from '../types/theme-system'

const detectMacOSTheme = (): ThemeName => {
  try {
    const out = execSync('defaults read -g AppleInterfaceStyle', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
      .toLowerCase()
    if (out.includes('dark')) return 'dark'
    return 'light'
  } catch {
    return 'light'
  }
}

const detectWindowsTheme = (): ThemeName => {
  const queryReg = (key: 'AppsUseLightTheme' | 'SystemUsesLightTheme') => {
    try {
      const out = execSync(
        `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v ${key}`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      )
        .toString()
        .trim()
      return out
    } catch {
      return null
    }
  }

  const parseReg = (out: string | null): ThemeName | null => {
    if (!out) return null
    const match = out.match(/REG_DWORD\s+0x([0-9a-fA-F]+)/)
    if (!match) return null
    const value = parseInt(match[1], 16)
    return value === 0 ? 'dark' : 'light'
  }

  return (
    parseReg(queryReg('AppsUseLightTheme')) ??
    parseReg(queryReg('SystemUsesLightTheme')) ??
    'light'
  )
}

const detectLinuxTheme = (): ThemeName => {
  const gtkThemeEnv = process.env.GTK_THEME?.toLowerCase()
  if (gtkThemeEnv) {
    if (gtkThemeEnv.includes('dark')) return 'dark'
    return 'light'
  }

  const tryExec = (cmd: string): string | null => {
    try {
      const out = execSync(cmd, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
      return out
    } catch {
      return null
    }
  }

  const gnomeColorScheme = tryExec(
    'gsettings get org.gnome.desktop.interface color-scheme',
  )
  if (gnomeColorScheme) {
    if (gnomeColorScheme.includes('prefer-dark')) return 'dark'
    return 'light'
  }

  const gnomeGtkTheme = tryExec(
    'gsettings get org.gnome.desktop.interface gtk-theme',
  )
  if (gnomeGtkTheme) {
    if (gnomeGtkTheme.toLowerCase().includes('dark')) return 'dark'
    return 'light'
  }

  const kdeSchemeGroupGeneral = tryExec(
    'kreadconfig5 --group General --key ColorScheme',
  )
  if (kdeSchemeGroupGeneral) {
    if (kdeSchemeGroupGeneral.toLowerCase().includes('dark')) return 'dark'
    return 'light'
  }
  const kdeSchemeGroupKDE = tryExec(
    'kreadconfig5 --group KDE --key ColorScheme',
  )
  if (kdeSchemeGroupKDE) {
    if (kdeSchemeGroupKDE.toLowerCase().includes('dark')) return 'dark'
    return 'light'
  }

  const xfceTheme = tryExec(
    'xfconf-query -c xsettings -p /Net/ThemeName 2>/dev/null',
  )
  if (xfceTheme) {
    if (xfceTheme.toLowerCase().includes('dark')) return 'dark'
    return 'light'
  }

  return 'light'
}

export const detectPlatformTheme = (): ThemeName => {
  switch (process.platform) {
    case 'darwin':
      return detectMacOSTheme()
    case 'win32':
      return detectWindowsTheme()
    default:
      return detectLinuxTheme()
  }
}
