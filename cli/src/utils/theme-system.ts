import fs from 'node:fs'
import { execSync } from 'node:child_process'

import type { MarkdownPalette } from './markdown-renderer'

type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface ChatTheme {
  background: string
  chromeBg: string
  chromeText: string
  accentBg: string
  accentText: string
  panelBg: string
  aiLine: string
  userLine: string
  timestampAi: string
  timestampUser: string
  messageAiText: string
  messageUserText: string
  messageBg: string
  statusAccent: string
  statusSecondary: string
  inputBg: string
  inputFg: string
  inputFocusedBg: string
  inputFocusedFg: string
  inputPlaceholder: string
  cursor: string
  agentPrefix: string
  agentName: string
  agentText: string
  agentCheckmark: string
  agentResponseCount: string
  agentFocusedBg: string
  agentContentText: string
  agentToggleHeaderBg: string
  agentToggleHeaderText: string
  agentToggleText: string
  agentToggleExpandedBg: string
  agentContentBg: string
  modeToggleFastBg: string
  modeToggleFastText: string
  modeToggleMaxBg: string
  modeToggleMaxText: string
  markdown?: {
    headingFg?: Partial<Record<MarkdownHeadingLevel, string>>
    inlineCodeFg?: string
    codeBackground?: string
    codeHeaderFg?: string
    listBulletFg?: string
    blockquoteBorderFg?: string
    blockquoteTextFg?: string
    dividerFg?: string
    codeTextFg?: string
    codeMonochrome?: boolean
  }
}

const BASE_THEMES: Record<'dark' | 'light', ChatTheme> = {
  dark: {
    background: 'transparent',
    chromeBg: 'transparent',
    chromeText: '#e2e8f0',
    accentBg: 'transparent',
    accentText: '#facc15',
    panelBg: 'transparent',
    aiLine: '#34d399',
    userLine: '#38bdf8',
    timestampAi: '#4ade80',
    timestampUser: '#60a5fa',
    messageAiText: '#9aa5ce',
    messageUserText: '#9aa5ce',
    messageBg: 'transparent',
    statusAccent: '#facc15',
    statusSecondary: '#d9e2ff',
    inputBg: 'transparent',
    inputFg: '#e2e8f0',
    inputFocusedBg: 'transparent',
    inputFocusedFg: '#e2e8f0',
    inputPlaceholder: 'default',
    cursor: '#22c55e',
    agentPrefix: '#22c55e',
    agentName: '#4ade80',
    agentText: '#e2e8f0',
    agentCheckmark: '#22c55e',
    agentResponseCount: '#94a3b8',
    agentFocusedBg: 'transparent',
    agentContentText: '#e2e8f0',
    agentToggleHeaderBg: 'default',
    agentToggleHeaderText: 'default',
    agentToggleText: 'default',
    agentToggleExpandedBg: '#047857',
    agentContentBg: 'transparent',
    modeToggleFastBg: '#f97316',
    modeToggleFastText: '#f97316',
    modeToggleMaxBg: '#dc2626',
    modeToggleMaxText: '#dc2626',
    markdown: {
      codeBackground: 'transparent',
      codeHeaderFg: '#d9e2ff',
      inlineCodeFg: '#e2e8f0',
      codeTextFg: '#e2e8f0',
      headingFg: {
        1: '#facc15',
        2: '#facc15',
        3: '#facc15',
        4: '#facc15',
        5: '#facc15',
        6: '#facc15',
      },
      listBulletFg: '#d9e2ff',
      blockquoteBorderFg: '#4b5563',
      blockquoteTextFg: '#f1f5f9',
      dividerFg: '#334155',
      codeMonochrome: true,
    },
  },
  light: {
    background: 'transparent',
    chromeBg: 'transparent',
    chromeText: '#334155',
    accentBg: 'transparent',
    accentText: '#f59e0b',
    panelBg: 'transparent',
    aiLine: '#059669',
    userLine: '#3b82f6',
    timestampAi: '#047857',
    timestampUser: '#2563eb',
    messageAiText: '#9aa5ce',
    messageUserText: '#9aa5ce',
    messageBg: 'transparent',
    statusAccent: '#f59e0b',
    statusSecondary: '#6b7280',
    inputBg: 'transparent',
    inputFg: '#334155',
    inputFocusedBg: 'transparent',
    inputFocusedFg: '#334155',
    inputPlaceholder: '#9ca3af',
    cursor: '#3b82f6',
    agentPrefix: '#059669',
    agentName: '#047857',
    agentText: '#1f2937',
    agentCheckmark: '#059669',
    agentResponseCount: '#64748b',
    agentFocusedBg: 'transparent',
    agentContentText: '#475569',
    agentToggleHeaderBg: '#94a3b8',
    agentToggleHeaderText: '#f8fafc',
    agentToggleText: '#f8fafc',
    agentToggleExpandedBg: '#047857',
    agentContentBg: 'transparent',
    modeToggleFastBg: '#f97316',
    modeToggleFastText: '#f97316',
    modeToggleMaxBg: '#dc2626',
    modeToggleMaxText: '#dc2626',
    markdown: {
      codeBackground: 'transparent',
      codeHeaderFg: '#4b5563',
      inlineCodeFg: '#dc2626',
      codeTextFg: '#475569',
      headingFg: {
        1: '#dc2626',
        2: '#dc2626',
        3: '#dc2626',
        4: '#dc2626',
        5: '#dc2626',
        6: '#dc2626',
      },
      listBulletFg: '#6b7280',
      blockquoteBorderFg: '#d1d5db',
      blockquoteTextFg: '#374151',
      dividerFg: '#e5e7eb',
      codeMonochrome: true,
    },
  },
}

const getNormalizedEnvTheme = (): 'dark' | 'light' | null => {
  const raw = process.env.OPEN_TUI_THEME ?? process.env.OPENTUI_THEME
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'dark' || normalized === 'light') {
    return normalized
  }
  return null
}

const ANSI_BASE_COLORS: Array<[number, number, number]> = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
]

const ANSI_COLOR_CUBE_STEPS = [0, 95, 135, 175, 215, 255]

const coerceAnsiIndexToRgb = (index: number): [number, number, number] => {
  if (!Number.isFinite(index) || index < 0) {
    return [0, 0, 0]
  }

  if (index < ANSI_BASE_COLORS.length) {
    return ANSI_BASE_COLORS[index]
  }

  if (index >= 232) {
    const level = Math.min(23, Math.max(0, index - 232))
    const value = 8 + level * 10
    return [value, value, value]
  }

  const cubeIndex = Math.min(215, Math.max(0, index - 16))
  const r = Math.floor(cubeIndex / 36)
  const g = Math.floor((cubeIndex % 36) / 6)
  const b = cubeIndex % 6
  return [
    ANSI_COLOR_CUBE_STEPS[r],
    ANSI_COLOR_CUBE_STEPS[g],
    ANSI_COLOR_CUBE_STEPS[b],
  ]
}

const estimateBrightness = (rgb: [number, number, number]): number => {
  const [r, g, b] = rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const detectThemeFromColorFgbg = (): 'dark' | 'light' | null => {
  const colorFgbg = process.env.COLORFGBG
  if (!colorFgbg) return null
  const parts = colorFgbg.split(';')
  if (parts.length === 0) return null
  const backgroundRaw = parts[parts.length - 1]
  const backgroundValue = Number.parseInt(backgroundRaw, 10)
  if (Number.isNaN(backgroundValue)) return null

  const brightness = estimateBrightness(coerceAnsiIndexToRgb(backgroundValue))
  return brightness >= 160 ? 'light' : 'dark'
}

const OSC_BACKGROUND_QUERY = '\u001b]11;?\u0007'

const parseOscColorComponent = (component: string): number | null => {
  if (!component) return null
  if (!/^[0-9A-Fa-f]+$/.test(component)) return null
  const value = Number.parseInt(component, 16)
  if (!Number.isFinite(value)) return null
  const bitLength = component.length * 4
  const maxValue = (1 << bitLength) - 1
  if (maxValue <= 0) return null
  return Math.round((value / maxValue) * 255)
}

const parseOscColor = (payload: string): [number, number, number] | null => {
  if (!payload) return null
  const trimmed = payload.trim()
  const lowerTrimmed = trimmed.toLowerCase()

  if (lowerTrimmed.startsWith('rgb:') || lowerTrimmed.startsWith('rgba:')) {
    const separatorIndex = trimmed.indexOf(':')
    const parts = trimmed
      .slice(separatorIndex + 1)
      .split('/')
      .filter((part) => part.length > 0)

    if (parts.length < 3) return null

    const [r, g, b] = parts.slice(0, 3).map(parseOscColorComponent)
    if (
      r === null ||
      g === null ||
      b === null ||
      Number.isNaN(r) ||
      Number.isNaN(g) ||
      Number.isNaN(b)
    ) {
      return null
    }
    return [r, g, b]
  }

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1)

    if (hex.length === 3 || hex.length === 4) {
      const r = Number.parseInt(hex[0] + hex[0], 16)
      const g = Number.parseInt(hex[1] + hex[1], 16)
      const b = Number.parseInt(hex[2] + hex[2], 16)
      if ([r, g, b].some((value) => Number.isNaN(value))) {
        return null
      }
      return [r, g, b]
    }

    if (hex.length === 6 || hex.length === 8) {
      const baseHex = hex.length === 8 ? hex.slice(0, 6) : hex
      const r = Number.parseInt(baseHex.slice(0, 2), 16)
      const g = Number.parseInt(baseHex.slice(2, 4), 16)
      const b = Number.parseInt(baseHex.slice(4, 6), 16)
      if ([r, g, b].some((value) => Number.isNaN(value))) {
        return null
      }
      return [r, g, b]
    }
  }

  return null
}
const detectThemeFromTerminalBackground = (): 'dark' | 'light' | null => {
  if (process.platform === 'win32') return null
  if (!process.stdout.isTTY) return null

  let fd: number | null = null
  try {
    fd = fs.openSync(
      '/dev/tty',
      fs.constants.O_RDWR |
        fs.constants.O_NOCTTY |
        fs.constants.O_NONBLOCK,
    )
  } catch {
    return null
  }

  try {
    fs.writeSync(fd, OSC_BACKGROUND_QUERY)
    const start = Date.now()
    const buffer = Buffer.alloc(256)
    let response = ''

    while (Date.now() - start < 100) {
      let bytesRead = 0
      try {
        bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'EAGAIN'
        ) {
          continue
        }
        return null
      }

      if (bytesRead > 0) {
        response += buffer.toString('utf8', 0, bytesRead)
        if (/\u0007|\u001b\\/.test(response)) {
          break
        }
      } else {
        break
      }
    }

    const match = response.match(/\u001b]11;([^\u0007\u001b]*)(?:\u0007|\u001b\\)/)
    if (!match) return null

    const rgb = parseOscColor(match[1])
    if (!rgb) return null

    const brightness = estimateBrightness(rgb)
    return brightness >= 160 ? 'light' : 'dark'
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // Ignore close errors
      }
    }
  }
}

const detectThemeFromSystemAppearance = (): 'dark' | 'light' | null => {
  if (process.platform !== 'darwin') return null
  try {
    const output = execSync('defaults read -g AppleInterfaceStyle', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim()
    if (!output) return 'light'
    const normalized = output.toLowerCase()
    if (normalized === 'dark' || normalized === 'light') {
      return normalized
    }
  } catch {
    return null
  }
  return null
}

const resolvedThemeName: 'dark' | 'light' =
  getNormalizedEnvTheme() ??
  detectThemeFromColorFgbg() ??
  detectThemeFromTerminalBackground() ??
  detectThemeFromSystemAppearance() ??
  'light'

const baseTheme = BASE_THEMES[resolvedThemeName]
const markdown = baseTheme.markdown
  ? {
      ...baseTheme.markdown,
      headingFg: baseTheme.markdown.headingFg
        ? { ...baseTheme.markdown.headingFg }
        : undefined,
    }
  : undefined

export const chatTheme: ChatTheme = {
  ...baseTheme,
  markdown,
}

export const createMarkdownPalette = (theme: ChatTheme): MarkdownPalette => {
  const headingDefaults: Record<MarkdownHeadingLevel, string> = {
    1: theme.statusAccent,
    2: theme.statusAccent,
    3: theme.statusAccent,
    4: theme.statusAccent,
    5: theme.statusAccent,
    6: theme.statusAccent,
  }

  const overrides = theme.markdown?.headingFg ?? {}

  return {
    inlineCodeFg: theme.markdown?.inlineCodeFg ?? theme.messageAiText,
    codeBackground: theme.markdown?.codeBackground ?? theme.messageBg,
    codeHeaderFg: theme.markdown?.codeHeaderFg ?? theme.statusSecondary,
    headingFg: {
      ...headingDefaults,
      ...overrides,
    },
    listBulletFg: theme.markdown?.listBulletFg ?? theme.statusSecondary,
    blockquoteBorderFg:
      theme.markdown?.blockquoteBorderFg ?? theme.statusSecondary,
    blockquoteTextFg: theme.markdown?.blockquoteTextFg ?? theme.messageAiText,
    dividerFg: theme.markdown?.dividerFg ?? theme.statusSecondary,
    codeTextFg: theme.markdown?.codeTextFg ?? theme.messageAiText,
    codeMonochrome: theme.markdown?.codeMonochrome ?? true,
  }
}
