/** Slash-command model for the composer palette (typing `/` in the main input). */

import type { Skill } from './types'

export type CommandAction =
  | { type: 'new-thread' }
  | { type: 'close-thread' }
  | { type: 'reopen-thread' }
  | { type: 'skill'; name: string }

export interface Command {
  /** Token typed after the slash, e.g. `new` or a skill name. */
  name: string
  hint: string
  kind: 'command' | 'skill'
  action: CommandAction
}

/** App-level commands, shown above skills. */
const APP_COMMANDS: Command[] = [
  { name: 'new', hint: 'Start a new thread', kind: 'command', action: { type: 'new-thread' } },
  { name: 'close', hint: 'Close this thread', kind: 'command', action: { type: 'close-thread' } },
  { name: 'reopen', hint: 'Reopen the last closed thread', kind: 'command', action: { type: 'reopen-thread' } },
]

/** Full command list: app commands followed by one entry per skill. */
export function buildCommands(skills: Skill[]): Command[] {
  const skillCmds: Command[] = skills.map((s) => ({
    name: s.name,
    hint: s.builtin ? 'Run the built-in skill' : 'Run skill',
    kind: 'skill',
    action: { type: 'skill', name: s.name },
  }))
  return [...APP_COMMANDS, ...skillCmds]
}

/**
 * Filter by the text after the slash. Prefix matches rank above substring
 * matches so `/re` surfaces `reopen`/`review` before `simplify`+`reflect`-style
 * inner hits. An empty query returns everything (the full menu on a bare `/`).
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.toLowerCase()
  if (!q) return commands
  const scored = commands
    .map((c) => {
      const name = c.name.toLowerCase()
      const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : -1
      return { c, rank }
    })
    .filter((x) => x.rank >= 0)
  scored.sort((a, b) => a.rank - b.rank)
  return scored.map((x) => x.c)
}
