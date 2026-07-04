import { env, IS_DEV } from '@codebirds/common/env'

import { IS_CODEBIRDS } from '../utils/constants'

// Get the website URL from environment or use default
export const WEBSITE_URL = env.NEXT_PUBLIC_CODEBIRDS_APP_URL

// Freebuff login flow uses the codebirds web app instead of codebirds.com
const CODEBIRDS_WEB_URL = IS_DEV
  ? 'http://localhost:3002'
  : (env.NEXT_PUBLIC_CODEBIRDS_APP_URL ?? 'https://codebirds.com')
export const LOGIN_WEBSITE_URL = IS_CODEBIRDS ? CODEBIRDS_WEB_URL : WEBSITE_URL

// Codebirds ASCII Logo - compact version for 80-width terminals
const LOGO_CODEBUFF = `
  ██████╗ ██████╗ ██████╗ ███████╗██████╗ ██╗   ██╗███████╗███████╗
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝██╔════╝
 ██║     ██║   ██║██║  ██║█████╗  ██████╔╝██║   ██║█████╗  █████╗
 ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗██║   ██║██╔══╝  ██╔══╝
 ╚██████╗╚██████╔╝██████╔╝███████╗██████╔╝╚██████╔╝██║     ██║
  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═════╝  ╚═════╝ ╚═╝     ╚═╝
`

const LOGO_SMALL_CODEBUFF = `
  ██████╗ ██████╗
 ██╔════╝ ██╔══██╗
 ██║      ██████╔╝
 ██║      ██╔══██╗
 ╚██████╗ ██████╔╝
  ╚═════╝ ╚═════╝
`

// Freebuff ASCII Logo
const LOGO_CODEBIRDS = `
 ███████╗██████╗ ███████╗███████╗██████╗ ██╗   ██╗███████╗███████╗
 ██╔════╝██╔══██╗██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔════╝
 █████╗  ██████╔╝█████╗  █████╗  ██████╔╝██║   ██║█████╗  █████╗
 ██╔══╝  ██╔══██╗██╔══╝  ██╔══╝  ██╔══██╗██║   ██║██╔══╝  ██╔══╝
 ██║     ██║  ██║███████╗███████╗██████╔╝╚██████╔╝██║     ██║
 ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚═════╝  ╚═════╝ ╚═╝     ╚═╝
`

const LOGO_SMALL_CODEBIRDS = `
 ███████╗██████╗
 ██╔════╝██╔══██╗
 █████╗  ██████╔╝
 ██╔══╝  ██╔══██╗
 ██║     ██████╔╝
 ╚═╝     ╚═════╝
`

export const LOGO = IS_CODEBIRDS ? LOGO_CODEBIRDS : LOGO_CODEBUFF
export const LOGO_SMALL = IS_CODEBIRDS ? LOGO_SMALL_CODEBIRDS : LOGO_SMALL_CODEBUFF

// Shadow/border characters that receive the sheen animation effect
export const SHADOW_CHARS = new Set([
  '╚',
  '═',
  '╝',
  '║',
  '╔',
  '╗',
  '╠',
  '╣',
  '╦',
  '╩',
  '╬',
])

// Modal sizing constants
export const DEFAULT_TERMINAL_HEIGHT = 24
export const MODAL_VERTICAL_MARGIN = 2 // Space for top positioning (1) + bottom margin (1)
export const MAX_MODAL_BASE_HEIGHT = 22 // Maximum height when no warning banner
export const WARNING_BANNER_HEIGHT = 3 // Height of invalid credentials banner (padding + text + padding)

// Sheen animation constants
export const SHEEN_WIDTH = 5
export const SHEEN_STEP = 2 // Advance 2 positions per frame for efficiency
export const SHEEN_INTERVAL_MS = 150
