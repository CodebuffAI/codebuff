// Input mode types and configurations
// To add a new mode:
// 1. Add it to the InputMode type
// 2. Add its configuration to INPUT_MODE_CONFIGS

export type InputMode = 'default' | 'bash' | 'referral' | 'usage' | 'image'

// Theme color keys that are valid color values (must match ChatTheme keys)
export type ThemeColorKey =
  | 'foreground'
  | 'background'
  | 'error'
  | 'warning'
  | 'success'
  | 'info'
  | 'muted'

export type InputModeConfig = {
  /** Prefix icon shown before input (e.g., "!" for bash) */
  icon: string | null
  /** Theme color key for icon and border */
  color: ThemeColorKey
  /** Input placeholder text */
  placeholder: string
  /** Width adjustment for the prefix (icon width + padding) */
  widthAdjustment: number
  /** Whether to show the agent mode toggle */
  showAgentModeToggle: boolean
  /** Whether to disable slash command suggestions */
  disableSlashSuggestions: boolean
}

export const INPUT_MODE_CONFIGS: Record<InputMode, InputModeConfig> = {
  default: {
    icon: null,
    color: 'foreground',
    placeholder: 'enter a coding task or / for commands',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
  },
  bash: {
    icon: '!',
    color: 'success',
    placeholder: 'enter bash command...',
    widthAdjustment: 2, // 1 char + 1 padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
  },
  referral: {
    icon: '◎',
    color: 'warning',
    placeholder: 'have a code? enter it here',
    widthAdjustment: 2, // 1 char + 1 padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
  },
  usage: {
    icon: null,
    color: 'foreground',
    placeholder: 'enter a coding task or / for commands',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
  },
  image: {
    icon: '📎',
    color: 'info',
    placeholder: 'enter image path or Ctrl+V to paste',
    widthAdjustment: 3, // emoji width + padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
  },
}

export function getInputModeConfig(mode: InputMode): InputModeConfig {
  return INPUT_MODE_CONFIGS[mode]
}
