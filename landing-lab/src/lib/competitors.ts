export type Competitor = {
  name: string
  /** Brand color (used for the intro-grid fallback tiles). */
  color: string
  /** Glyph shown in the lettermark fallback when no real logo exists. */
  mark: string
  /** Simple Icons slug for the real brand logo, when one exists. */
  slug?: string
  /** Domain used to fetch a favicon when Simple Icons has no entry. */
  domain?: string
  /** Explicit (background-free) logo URL that takes priority over everything. */
  logo?: string
  /** Projected average yearly cost in USD. */
  yearly: number
  /** Short note shown under the price. */
  note: string
  freebuff?: boolean
}

const FREEBUFF: Competitor = {
  name: 'Freebuff',
  color: '#54a967',
  mark: 'F',
  yearly: 0,
  note: 'Free forever',
  freebuff: true,
}

// CLI coding agents — projected average yearly cost (higher tiers).
export const CLI_COMPETITORS: Competitor[] = [
  FREEBUFF,
  { name: 'OpenCode', color: '#f5a623', mark: 'O', slug: 'opencode', domain: 'opencode.ai', yearly: 120, note: '$120 / yr' },
  { name: 'Codex', color: '#10a37f', mark: 'C', domain: 'openai.com', yearly: 240, note: '$20 / mo' },
  { name: 'Cursor', color: '#e6e6e6', mark: 'C', slug: 'cursor', domain: 'cursor.com', yearly: 720, note: '$60 / mo' },
  { name: 'Claude Code', color: '#d97757', mark: 'A', slug: 'claude', domain: 'claude.ai', yearly: 1200, note: '$100 / mo' },
  { name: 'Devin', color: '#6366f1', mark: 'D', domain: 'devin.ai', yearly: 2400, note: '$200 / mo' },
]

// Web app builders.
export const WEB_COMPETITORS: Competitor[] = [
  FREEBUFF,
  { name: 'Emergent', color: '#8b5cf6', mark: 'E', domain: 'emergent.sh', yearly: 240, note: '$20 / mo' },
  { name: 'Bolt.new', color: '#1389fd', mark: 'B', slug: 'bolt', domain: 'bolt.new', yearly: 324, note: '$27 / mo' },
  { name: 'Lovable', color: '#ff4d6d', mark: 'L', logo: '/lovable.svg', domain: 'lovable.dev', yearly: 600, note: '$50 / mo' },
  { name: 'Replit', color: '#f26207', mark: 'R', slug: 'replit', domain: 'replit.com', yearly: 1080, note: '$90 / mo' },
  { name: 'Base44', color: '#3b82f6', mark: 'B', domain: 'base44.com', yearly: 1920, note: '$160 / mo' },
]

// Chat assistants.
export const CHAT_COMPETITORS: Competitor[] = [
  FREEBUFF,
  { name: 'Copilot Pro', color: '#8957e5', mark: 'C', slug: 'githubcopilot', domain: 'github.com', yearly: 120, note: '$10 / mo' },
  { name: 'Perplexity Pro', color: '#20b8cd', mark: 'P', slug: 'perplexity', domain: 'perplexity.ai', yearly: 200, note: '$200 / yr' },
  { name: 'ChatGPT Plus', color: '#10a37f', mark: 'G', domain: 'openai.com', yearly: 240, note: '$20 / mo' },
  { name: 'Gemini Advanced', color: '#4285f4', mark: 'G', slug: 'googlegemini', domain: 'gemini.google.com', yearly: 240, note: '$20 / mo' },
  { name: 'Grok', color: '#e6e6e6', mark: 'X', slug: 'x', domain: 'x.ai', yearly: 360, note: '$30 / mo' },
]

export type TabId = 'cli' | 'web' | 'chat'

export const COMPETITORS_BY_TAB: Record<TabId, Competitor[]> = {
  cli: CLI_COMPETITORS,
  web: WEB_COMPETITORS,
  chat: CHAT_COMPETITORS,
}

/**
 * Logarithmic position (%) on the cost axis. Paid tools cluster in the upper
 * range and only differ slightly, while Freebuff's $0 sits at the far-left
 * origin — rendered as a dramatic thin sliver. Also used to place axis ticks.
 */
const AXIS_MIN = 60
const AXIS_MAX = 2600
export function logWidthPct(value: number): number {
  if (value <= 0) return 0
  const t =
    (Math.log10(value) - Math.log10(AXIS_MIN)) /
    (Math.log10(AXIS_MAX) - Math.log10(AXIS_MIN))
  const clamped = Math.max(0, Math.min(1, t))
  // Cap bars at ~76% so the price label always fits past the longest bar.
  return 6 + clamped * 70 // 6%..76%
}

/** Tick values rendered as gridlines on the log cost axis. */
export const AXIS_TICKS = [
  { value: 0, label: '$0' },
  { value: 100, label: '$100' },
  { value: 300, label: '$300' },
  { value: 1000, label: '$1k' },
]
