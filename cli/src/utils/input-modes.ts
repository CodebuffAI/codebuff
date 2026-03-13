import { IS_FREEBUFF } from './constants'

// Input mode types and configurations
// To add a new mode:
// 1. Add it to the InputMode type
// 2. Add its configuration to INPUT_MODE_CONFIGS

export type InputMode =
  | 'default'
  | 'bash'
  | 'homeDir'
  | 'plan'
  | 'review'
  | 'referral'
  | 'usage'
  | 'image'
  | 'help'
  | 'connect:claude'
  | 'connect:chatgpt'
  | 'outOfCredits'
  | 'subscriptionLimit'

// Theme color keys that are valid color values (must match ChatTheme keys)
export type ThemeColorKey =
  | 'foreground'
  | 'background'
  | 'error'
  | 'warning'
  | 'success'
  | 'info'
  | 'muted'
  | 'imageCardBorder'
  | 'link'

export type InputModeConfig = {
  /** Prefix icon shown before input (e.g., "!" for bash) */
  icon: string | null
  /** Colored label shown before input (e.g., "Plan") */
  label: string | null
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
  /** Whether keyboard shortcuts (Escape, Backspace) can exit this mode */
  blockKeyboardExit: boolean
}

export const INPUT_MODE_CONFIGS: Record<InputMode, InputModeConfig> = {
  default: {
    icon: null,
    label: null,
    color: 'foreground',
    placeholder: 'enter a coding task or / for commands',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
    blockKeyboardExit: false,
  },
  bash: {
    icon: '!',
    label: null,
    color: 'success',
    placeholder: 'enter bash command...',
    widthAdjustment: 2, // 1 char + 1 padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  homeDir: {
    icon: null,
    label: null,
    color: 'warning',
    placeholder: 'enter a coding task or / for commands',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
    blockKeyboardExit: false,
  },
  plan: {
    icon: null,
    label: 'Plan',
    color: 'info',
    placeholder: 'describe what you want to plan...',
    widthAdjustment: 7,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  review: {
    icon: null,
    label: 'Review',
    color: 'info',
    placeholder: 'describe what to review...',
    widthAdjustment: 9,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  referral: {
    icon: '◎',
    label: null,
    color: 'warning',
    placeholder: 'have a code? enter it here',
    widthAdjustment: 2, // 1 char + 1 padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  usage: {
    icon: null,
    label: null,
    color: 'foreground',
    placeholder: 'enter a coding task or / for commands',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
    blockKeyboardExit: false,
  },
  image: {
    icon: '📎',
    label: null,
    color: 'imageCardBorder',
    placeholder: 'enter image path or Ctrl+V to paste',
    widthAdjustment: 3, // emoji width + padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  help: {
    icon: null,
    label: null,
    color: 'info',
    placeholder: 'enter a coding task or / for commands',
    widthAdjustment: 0,
    showAgentModeToggle: true,
    disableSlashSuggestions: false,
    blockKeyboardExit: false,
  },
  'connect:claude': {
    icon: '🔗',
    label: null,
    color: 'info',
    placeholder: 'paste authorization code here...',
    widthAdjustment: 3, // emoji width + padding
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  'connect:chatgpt': {
    icon: '🔐',
    label: null,
    color: 'info',
    placeholder: 'authorizing in browser... press Escape to cancel',
    widthAdjustment: 3,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  outOfCredits: {
    icon: null,
    label: null,
    color: 'warning',
    placeholder: '',
    widthAdjustment: 0,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: false,
  },
  subscriptionLimit: {
    icon: null,
    label: null,
    color: 'warning',
    placeholder: '',
    widthAdjustment: 0,
    showAgentModeToggle: false,
    disableSlashSuggestions: true,
    blockKeyboardExit: true, // User must click "Continue with credits" or wait for reset
  },
}

// In Freebuff, never show the agent mode toggle
if (IS_FREEBUFF) {
  for (const key of Object.keys(INPUT_MODE_CONFIGS) as InputMode[]) {
    INPUT_MODE_CONFIGS[key].showAgentModeToggle = false
  }
}

export function getInputModeConfig(mode: InputMode): InputModeConfig {
  return INPUT_MODE_CONFIGS[mode]
}
