import fs from 'node:fs'
import { execSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

import { TextAttributes } from '@opentui/core'

import type { MarkdownPalette } from './markdown-renderer'
import { EventEmitter } from 'events'
import { logger } from './logger'

type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export type ThemeColor = string

export const resolveThemeColor = (
  color?: ThemeColor,
  fallback?: ThemeColor,
): string | undefined => {
  if (typeof color === 'string') {
    const normalized = color.trim().toLowerCase()
    if (normalized.length > 0 && normalized !== 'default') {
      return color
    }
  }

  if (fallback !== undefined) {
    return resolveThemeColor(fallback)
  }

  return undefined
}

export interface ChatTheme {
  background: string
  chromeBg: string
  chromeText: ThemeColor
  accentBg: string
  accentText: string
  panelBg: string
  aiLine: string
  userLine: string
  timestampAi: string
  timestampUser: string
  messageAiText: ThemeColor
  messageUserText: ThemeColor
  messageBg: string
  statusAccent: string
  statusSecondary: string
  inputBg: string
  inputFg: ThemeColor
  inputFocusedBg: string
  inputFocusedFg: ThemeColor
  inputPlaceholder: ThemeColor
  cursor: string
  agentPrefix: string
  agentName: string
  agentText: ThemeColor
  agentCheckmark: string
  agentResponseCount: string
  agentFocusedBg: string
  agentContentText: ThemeColor
  agentToggleHeaderBg: string
  agentToggleHeaderText: ThemeColor
  agentToggleText: ThemeColor
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
  messageTextAttributes?: number
}

const TEXT_NEUTRALS: Record<'dark' | 'light', { primary: string; secondary: string }> = {
  dark: {
    primary: '#ffffff',
    secondary: '#dbeafe',
  },
  light: {
    primary: '#1f2937',
    secondary: '#475569',
  },
}

const IS_MAC_TERMINAL =
  process.platform === 'darwin' && process.env.TERM_PROGRAM === 'Apple_Terminal'

const NEUTRAL_THEME: ChatTheme = {
  background: 'transparent',
  chromeBg: 'transparent',
  chromeText: 'default',
  accentBg: 'transparent',
  accentText: '#2563eb',
  panelBg: 'transparent',
  aiLine: '#2563eb',
  userLine: '#22c55e',
  timestampAi: '#2563eb',
  timestampUser: '#0ea5e9',
  messageAiText: 'default',
  messageUserText: 'default',
  messageBg: 'transparent',
  statusAccent: '#2563eb',
  statusSecondary: '#475569',
  inputBg: 'transparent',
  inputFg: 'default',
  inputFocusedBg: 'transparent',
  inputFocusedFg: 'default',
  inputPlaceholder: '#94a3b8',
  cursor: '#2563eb',
  agentPrefix: '#2563eb',
  agentName: '#0ea5e9',
  agentText: 'default',
  agentCheckmark: '#22c55e',
  agentResponseCount: '#475569',
  agentFocusedBg: 'transparent',
  agentContentText: 'default',
  agentToggleHeaderBg: 'transparent',
  agentToggleHeaderText: 'default',
  agentToggleText: 'default',
  agentToggleExpandedBg: '#1d4ed8',
  agentContentBg: 'transparent',
  modeToggleFastBg: '#f97316',
  modeToggleFastText: '#f97316',
  modeToggleMaxBg: '#dc2626',
  modeToggleMaxText: '#dc2626',
  markdown: {
    codeBackground: 'transparent',
    codeHeaderFg: '#475569',
    inlineCodeFg: '#2563eb',
    codeTextFg: '#2563eb',
    headingFg: {
      1: '#2563eb',
      2: '#2563eb',
      3: '#2563eb',
      4: '#2563eb',
      5: '#2563eb',
      6: '#2563eb',
    },
    listBulletFg: '#475569',
    blockquoteBorderFg: '#94a3b8',
    blockquoteTextFg: '#475569',
    dividerFg: '#94a3b8',
    codeMonochrome: true,
  },
}

const BASE_THEMES: Record<'dark' | 'light', ChatTheme> = {
  dark: NEUTRAL_THEME,
  light: NEUTRAL_THEME,
}

const applyNeutralTextDefaults = (
  theme: ChatTheme,
  mode: 'dark' | 'light',
): { theme: ChatTheme; allowTerminalDefaults: boolean } => {
  const neutrals = TEXT_NEUTRALS[mode]
  const allowTerminalDefaults = !IS_MAC_TERMINAL

  const resolveColor = (
    color: ThemeColor | undefined,
    fallback: string,
    allowDefault: boolean,
  ): string => {
    if (typeof color === 'string' && color !== 'default') {
      return color
    }
    return allowDefault ? 'default' : fallback
  }

  const resolvedMessageAiText = resolveColor(
    theme.messageAiText,
    neutrals.primary,
    allowTerminalDefaults,
  )
  const resolvedMessageUserText = resolveColor(
    theme.messageUserText,
    neutrals.primary,
    allowTerminalDefaults,
  )
  const messageUserFallback =
    resolvedMessageUserText === 'default'
      ? neutrals.primary
      : resolvedMessageUserText

  const resolvedInputFg = resolveColor(
    theme.inputFg,
    messageUserFallback,
    allowTerminalDefaults,
  )
  const resolvedInputFocusedFg = resolveColor(
    theme.inputFocusedFg ?? theme.inputFg ?? messageUserFallback,
    messageUserFallback,
    allowTerminalDefaults,
  )

  const adjustedTheme: ChatTheme = {
    ...theme,
    chromeText: theme.chromeText ?? neutrals.primary,
    messageAiText: resolvedMessageAiText,
    messageUserText: resolvedMessageUserText,
    inputFg: resolvedInputFg,
    inputFocusedFg: resolvedInputFocusedFg,
    agentText: resolveColor(
      theme.agentText,
      neutrals.primary,
      allowTerminalDefaults,
    ),
    agentContentText: resolveColor(
      theme.agentContentText,
      neutrals.secondary,
      allowTerminalDefaults,
    ),
    agentToggleHeaderText: resolveColor(
      theme.agentToggleHeaderText,
      neutrals.primary,
      allowTerminalDefaults,
    ),
    agentToggleText: resolveColor(
      theme.agentToggleText,
      neutrals.primary,
      allowTerminalDefaults,
    ),
  }

  if (mode === 'dark') {
    adjustedTheme.messageAiText = '#ffffff'
    adjustedTheme.messageUserText = '#ffffff'
    adjustedTheme.inputFg = '#ffffff'
    adjustedTheme.inputFocusedFg = '#ffffff'
    adjustedTheme.agentText = '#ffffff'
    adjustedTheme.agentContentText = '#dbeafe'
    adjustedTheme.agentToggleHeaderText = '#ffffff'
    adjustedTheme.agentToggleText = '#ffffff'
    adjustedTheme.timestampAi = DARK_VARIANT_OVERRIDES.timestampAi
    adjustedTheme.timestampUser = DARK_VARIANT_OVERRIDES.timestampUser
    adjustedTheme.aiLine = DARK_VARIANT_OVERRIDES.aiLine
    adjustedTheme.userLine = DARK_VARIANT_OVERRIDES.userLine
    adjustedTheme.statusSecondary =
      theme.statusSecondary === NEUTRAL_THEME.statusSecondary
        ? '#bfdbfe'
        : theme.statusSecondary
    adjustedTheme.agentResponseCount =
      theme.agentResponseCount === NEUTRAL_THEME.agentResponseCount
        ? '#bfdbfe'
        : theme.agentResponseCount
    adjustedTheme.timestampAi = '#c7d2fe'
    adjustedTheme.timestampUser = '#bfdbfe'
    adjustedTheme.aiLine = '#60a5fa'
    adjustedTheme.userLine = '#38bdf8'
    adjustedTheme.messageTextAttributes =
      theme.messageTextAttributes ?? TextAttributes.BOLD
  } else {
    adjustedTheme.messageAiText = neutrals.primary
    adjustedTheme.messageUserText = neutrals.primary
    adjustedTheme.inputFg = neutrals.primary
    adjustedTheme.inputFocusedFg = neutrals.primary
    adjustedTheme.agentText = neutrals.primary
    adjustedTheme.agentContentText = neutrals.secondary
    adjustedTheme.agentToggleHeaderText = neutrals.primary
    adjustedTheme.agentToggleText = neutrals.primary
    adjustedTheme.timestampAi = LIGHT_VARIANT_OVERRIDES.timestampAi
    adjustedTheme.timestampUser = LIGHT_VARIANT_OVERRIDES.timestampUser
    adjustedTheme.aiLine = LIGHT_VARIANT_OVERRIDES.aiLine
    adjustedTheme.userLine = LIGHT_VARIANT_OVERRIDES.userLine
    adjustedTheme.messageTextAttributes =
      theme.messageTextAttributes ?? undefined
  }

  let finalTheme = adjustedTheme
  if (IS_MAC_TERMINAL) {
    finalTheme = mergeThemeOverrides(
      adjustedTheme,
      MAC_TERMINAL_THEME_OVERRIDES[mode],
    )
  }

  return { theme: finalTheme, allowTerminalDefaults }
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

const DARK_VARIANT_OVERRIDES = {
  timestampAi: '#c7d2fe',
  timestampUser: '#bfdbfe',
  aiLine: '#60a5fa',
  userLine: '#38bdf8',
}

const LIGHT_VARIANT_OVERRIDES = {
  timestampAi: NEUTRAL_THEME.timestampAi,
  timestampUser: NEUTRAL_THEME.timestampUser,
  aiLine: NEUTRAL_THEME.aiLine,
  userLine: NEUTRAL_THEME.userLine,
}

const MAC_TERMINAL_THEME_OVERRIDES: Record<'dark' | 'light', Partial<ChatTheme>> = {
  light: {
    statusAccent: '#0f62fe',
    statusSecondary: '#334155',
    agentResponseCount: '#0f62fe',
    agentPrefix: '#0f62fe',
    agentName: '#0f172a',
    agentText: '#1f2937',
    agentContentText: '#334155',
    agentToggleHeaderText: '#0f172a',
    agentToggleText: '#0f172a',
    chromeText: '#0f172a',
    inputFg: '#000000',
    inputFocusedFg: '#000000',
    inputPlaceholder: '#64748b',
    markdown: {
      inlineCodeFg: '#0f62fe',
      codeTextFg: '#0f172a',
      headingFg: {
        1: '#0f62fe',
        2: '#0f62fe',
        3: '#0f62fe',
        4: '#0f62fe',
        5: '#0f62fe',
        6: '#0f62fe',
      },
    },
  },
  dark: {
    statusAccent: '#7dd3fc',
    statusSecondary: '#dbeafe',
    agentResponseCount: '#93c5fd',
    agentPrefix: '#7dd3fc',
    agentName: '#ffffff',
    agentText: '#ffffff',
    agentContentText: '#dbeafe',
    agentToggleHeaderText: '#ffffff',
    agentToggleText: '#ffffff',
    chromeText: '#ffffff',
    inputPlaceholder: '#cbd5f5',
    markdown: {
      inlineCodeFg: '#93c5fd',
      codeTextFg: '#dbeafe',
      headingFg: {
        1: '#93c5fd',
        2: '#93c5fd',
        3: '#93c5fd',
        4: '#93c5fd',
        5: '#93c5fd',
        6: '#93c5fd',
      },
    },
  },
}

const mergeThemeOverrides = (
  base: ChatTheme,
  overrides: Partial<ChatTheme>,
): ChatTheme => {
  if (!overrides) return base

  const { markdown: markdownOverrides, ...rest } = overrides
  const merged: ChatTheme = {
    ...base,
    ...rest,
  }

  if (markdownOverrides) {
    const baseMarkdown = base.markdown ?? {}
    const headingOverrides = markdownOverrides.headingFg
    const mergedMarkdown: NonNullable<ChatTheme['markdown']> = {
      ...baseMarkdown,
      ...markdownOverrides,
    }
    if (headingOverrides) {
      mergedMarkdown.headingFg = {
        ...(baseMarkdown.headingFg ?? {}),
        ...headingOverrides,
      }
    }
    merged.markdown = mergedMarkdown
  }

  return merged
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

const escapeRegex = (value: string): string =>
  value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')

const detectThemeFromMacTerminal = (): 'dark' | 'light' | null => {
  if (process.platform !== 'darwin') return null
  if (process.env.TERM_PROGRAM !== 'Apple_Terminal') return null

  const profile =
    process.env.TERM_PROFILE ||
    (() => {
      try {
        return execSync("defaults read com.apple.Terminal 'Default Window Settings'", {
          stdio: ['ignore', 'pipe', 'ignore'],
          encoding: 'utf8',
        }).trim()
      } catch {
        return null
      }
    })()
  if (!profile) {
    return detectThemeFromSystemAppearance()
  }

  try {
    const rawSettings = execSync(
      "defaults read com.apple.Terminal 'Window Settings'",
      {
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
      },
    )

    const profilePattern = new RegExp(
      `\"${escapeRegex(profile)}\"\\s*=\\s*\\{[^}]*?BackgroundColor\\s*=\\s*\\(([^)]*)\\)`,
      's',
    )
    const match = rawSettings.match(profilePattern)
    if (!match) return null

    const [r, g, b] = match[1]
      .split(',')
      .slice(0, 3)
      .map((component) => Number.parseFloat(component.trim()))
    if (
      [r, g, b].some(
        (component) => Number.isNaN(component) || !Number.isFinite(component),
      )
    ) {
      return null
    }

    const brightness = estimateBrightness([
      Math.round(Math.max(0, Math.min(1, r)) * 255),
      Math.round(Math.max(0, Math.min(1, g)) * 255),
      Math.round(Math.max(0, Math.min(1, b)) * 255),
    ])

    return brightness >= 160 ? 'light' : 'dark'
  } catch {
    return null
  }
}

type ThemeDetectionStep = {
  name: string
  detect: () => 'dark' | 'light' | null
}

const THEME_DETECTION_STEPS: ThemeDetectionStep[] = [
  {
    name: 'env',
    detect: getNormalizedEnvTheme,
  },
  {
    name: 'colorFgbg',
    detect: detectThemeFromColorFgbg,
  },
  {
    name: 'terminalBackground',
    detect: detectThemeFromTerminalBackground,
  },
  {
    name: 'macTerminalProfileOrSystemFallback',
    detect: detectThemeFromMacTerminal,
  },
  {
    name: 'systemAppearance',
    detect: detectThemeFromSystemAppearance,
  },
]

type ThemeDetectionRecord = {
  name: string
  value: 'dark' | 'light' | null
}

interface ThemeComputationMeta {
  theme: ChatTheme
  resolvedThemeName: 'dark' | 'light'
  allowTerminalDefaults: boolean
  detectionTrail: ThemeDetectionRecord[]
}

const computeTheme = (): ThemeComputationMeta => {
  const detectionTrail: ThemeDetectionRecord[] = []
  let resolvedThemeName: 'dark' | 'light' | null = null

  for (const step of THEME_DETECTION_STEPS) {
    const value = step.detect()
    detectionTrail.push({ name: step.name, value })
    if (value) {
      resolvedThemeName = value
      break
    }
  }

  if (!resolvedThemeName) {
    resolvedThemeName = 'light'
  }

  const baseTheme = BASE_THEMES[resolvedThemeName]
  const { theme: neutralizedTheme, allowTerminalDefaults } =
    applyNeutralTextDefaults(baseTheme, resolvedThemeName)
  const markdown = neutralizedTheme.markdown
    ? {
        ...neutralizedTheme.markdown,
        headingFg: neutralizedTheme.markdown.headingFg
          ? { ...neutralizedTheme.markdown.headingFg }
          : undefined,
      }
    : undefined

  const theme: ChatTheme = {
    ...neutralizedTheme,
    markdown,
  }

  return {
    theme,
    resolvedThemeName,
    allowTerminalDefaults,
    detectionTrail,
  }
}

const cloneChatTheme = (input: ChatTheme): ChatTheme => ({
  ...input,
  markdown: input.markdown
    ? {
        ...input.markdown,
        headingFg: input.markdown.headingFg
          ? { ...input.markdown.headingFg }
          : undefined,
      }
    : undefined,
})

const buildStaticTheme = (mode: 'dark' | 'light'): ChatTheme => {
  const baseClone = cloneChatTheme(BASE_THEMES[mode])
  const { theme } = applyNeutralTextDefaults(baseClone, mode)
  return cloneChatTheme(theme)
}

export const chatThemes: Record<'dark' | 'light', ChatTheme> = {
  dark: buildStaticTheme('dark'),
  light: buildStaticTheme('light'),
}


const themeEmitter = new EventEmitter()

let currentChatTheme: ChatTheme = NEUTRAL_THEME

export const chatTheme = new Proxy(currentChatTheme, {
  get(target, prop, receiver) {
    return Reflect.get(target, prop, receiver)
  },
  set(target, prop, value) {
    Reflect.set(target, prop, value)
    return true
  },
}) as ChatTheme

const applyTheme = (meta: ThemeComputationMeta, source: string) => {
  currentChatTheme = meta.theme
  Object.assign(chatTheme, meta.theme)
  themeEmitter.emit('theme-change', chatTheme, {
    source,
    resolvedThemeName: meta.resolvedThemeName,
  })

  if (process.env.CODEBUFF_THEME_DEBUG === '1') {
    logger.debug(
      {
        themeDetection: {
          isMacTerminal: IS_MAC_TERMINAL,
          termProgram: process.env.TERM_PROGRAM ?? null,
          termProfile: process.env.TERM_PROFILE ?? null,
          resolvedThemeName: meta.resolvedThemeName,
          allowTerminalDefaults: meta.allowTerminalDefaults,
          detectionTrail: meta.detectionTrail,
          source,
          colors: {
            messageAiText: chatTheme.messageAiText,
            messageUserText: chatTheme.messageUserText,
            inputFg: chatTheme.inputFg,
            agentText: chatTheme.agentText,
            agentContentText: chatTheme.agentContentText,
          },
          messageTextAttributes: chatTheme.messageTextAttributes ?? null,
        },
      },
      'Resolved chat theme configuration',
    )
  }
}

const initialComputation = computeTheme()
applyTheme(initialComputation, 'initial')

export const onThemeChange = (
  listener: (
    theme: ChatTheme,
    meta: { source: string; resolvedThemeName: 'dark' | 'light' },
  ) => void,
) => {
  themeEmitter.on('theme-change', listener)
  return () => {
    themeEmitter.off('theme-change', listener)
  }
}

const recomputeTheme = (source: string) => {
  const meta = computeTheme()
  if (process.env.CODEBUFF_THEME_DEBUG === '1') {
    logger.debug(
      { source, resolvedThemeName: meta.resolvedThemeName },
      'Recomputing theme',
    )
  }
  applyTheme(meta, source)
}

const pendingReasons = new Set<string>()
let recomputeTimeout: NodeJS.Timeout | null = null

const scheduleThemeRecompute = (reason: string, delay = 100) => {
  pendingReasons.add(reason)
  if (recomputeTimeout) {
    clearTimeout(recomputeTimeout)
  }
  if (process.env.CODEBUFF_THEME_DEBUG === '1') {
    logger.debug(
      { reason, delay, pending: Array.from(pendingReasons) },
      'Scheduling theme recompute',
    )
  }
  recomputeTimeout = setTimeout(() => {
    recomputeTimeout = null
    const combinedReason = Array.from(pendingReasons).join(',')
    pendingReasons.clear()
    if (process.env.CODEBUFF_THEME_DEBUG === '1') {
      logger.debug(
        { combinedReason },
        'Executing scheduled theme recompute',
      )
    }
    recomputeTheme(combinedReason || reason)
  }, delay)
}

const macWatchers = new Map<string, fs.FSWatcher>()
const macWatcherRetryTimers = new Map<string, NodeJS.Timeout>()

const detachMacWatcher = (target: string) => {
  const watcher = macWatchers.get(target)
  if (!watcher) return
  try {
    watcher.close()
  } catch {
    // ignore close errors
  }
  macWatchers.delete(target)
}

const scheduleMacWatcherRetry = (target: string, delay = 750) => {
  const existing = macWatcherRetryTimers.get(target)
  if (existing) {
    clearTimeout(existing)
  }
  const timeout = setTimeout(() => {
    macWatcherRetryTimers.delete(target)
    attachMacWatcher(target)
  }, delay)
  macWatcherRetryTimers.set(target, timeout)
}

const attachMacWatcher = (target: string) => {
  detachMacWatcher(target)

  if (!fs.existsSync(target)) {
    if (process.env.CODEBUFF_THEME_DEBUG === '1') {
      logger.debug({ target }, 'Theme watcher target missing, scheduling retry')
    }
    scheduleMacWatcherRetry(target)
    return
  }

  try {
    const watcher = fs.watch(target, { persistent: false }, (eventType) => {
      if (process.env.CODEBUFF_THEME_DEBUG === '1') {
        logger.debug(
          { target, eventType },
          'Theme watcher detected change, scheduling recompute',
        )
      }
      scheduleThemeRecompute(
        `fs:${path.basename(target)}:${eventType}`,
        250,
      )

      if (eventType === 'rename') {
        if (process.env.CODEBUFF_THEME_DEBUG === '1') {
          logger.debug({ target }, 'Theme watcher received rename, reattaching')
        }
        scheduleMacWatcherRetry(target, 250)
      }
    })
    watcher.on('error', (error) => {
      logger.debug(
        {
          themeWatcherError:
            error instanceof Error ? error.message : String(error),
          target,
        },
        'Theme watcher encountered an error',
      )
      scheduleMacWatcherRetry(target)
    })
    macWatchers.set(target, watcher)
    if (process.env.CODEBUFF_THEME_DEBUG === '1') {
      logger.debug({ target }, 'Theme watcher attached')
    }
  } catch (error) {
    logger.debug(
      {
        themeWatcherError:
          error instanceof Error ? error.message : String(error),
        target,
      },
      'Failed to start theme watcher',
    )
    scheduleMacWatcherRetry(target)
  }
}

const setupMacThemeWatchers = () => {
  if (process.platform !== 'darwin') return

  const targets = [
    path.join(os.homedir(), 'Library/Preferences/.GlobalPreferences.plist'),
    path.join(os.homedir(), 'Library/Preferences/com.apple.Terminal.plist'),
  ]

  for (const target of targets) {
    attachMacWatcher(target)
  }
}

if (process.platform === 'darwin') {
  setupMacThemeWatchers()
}

const POLL_INTERVAL_MS = Number.parseInt(
  process.env.CODEBUFF_THEME_POLL_MS ?? '',
  10,
) || 5000

let pollInterval: NodeJS.Timeout | null = null
if (POLL_INTERVAL_MS > 0) {
  pollInterval = setInterval(() => {
    recomputeTheme('interval')
  }, POLL_INTERVAL_MS)
}

process.on('exit', () => {
  for (const watcher of macWatchers.values()) {
    try {
      watcher.close()
    } catch {
      // ignore
    }
  }
  macWatchers.clear()
  for (const timer of macWatcherRetryTimers.values()) {
    clearTimeout(timer)
  }
  macWatcherRetryTimers.clear()
  if (pollInterval) {
    clearInterval(pollInterval)
  }
})

process.on('SIGUSR2', () => {
  recomputeTheme('signal:SIGUSR2')
})

export const forceThemeRecompute = (reason = 'manual') => {
  recomputeTheme(reason)
}

export const createMarkdownPalette = (theme: ChatTheme): MarkdownPalette => {
  const inlineCodeFg =
    resolveThemeColor(theme.markdown?.inlineCodeFg, theme.messageAiText) ??
    theme.statusAccent
  const codeBackground =
    resolveThemeColor(theme.markdown?.codeBackground, theme.messageBg) ??
    'transparent'
  const codeHeaderFg =
    resolveThemeColor(theme.markdown?.codeHeaderFg, theme.statusSecondary) ??
    theme.statusSecondary
  const listBulletFg =
    resolveThemeColor(theme.markdown?.listBulletFg, theme.statusSecondary) ??
    theme.statusSecondary
  const blockquoteBorderFg =
    resolveThemeColor(
      theme.markdown?.blockquoteBorderFg,
      theme.statusSecondary,
    ) ?? theme.statusSecondary
  const blockquoteTextFg =
    resolveThemeColor(
      theme.markdown?.blockquoteTextFg,
      theme.agentContentText,
    ) ?? theme.statusSecondary
  const dividerFg =
    resolveThemeColor(theme.markdown?.dividerFg, theme.statusSecondary) ??
    theme.statusSecondary
  const codeTextFg =
    resolveThemeColor(theme.markdown?.codeTextFg, theme.agentContentText) ??
    inlineCodeFg

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
    inlineCodeFg,
    codeBackground,
    codeHeaderFg,
    headingFg: {
      ...headingDefaults,
      ...overrides,
    },
    listBulletFg,
    blockquoteBorderFg,
    blockquoteTextFg,
    dividerFg,
    codeTextFg,
    codeMonochrome: theme.markdown?.codeMonochrome ?? true,
  }
}
