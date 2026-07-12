/**
 * `/plan-timeline <slug>` (alias `tl`) — read `.agents/sessions/<slug>/EVENTS.jsonl`
 * and print a formatted timeline of session events.
 *
 * Mirrors the reader style of `cli/src/commands/plan-artifacts.ts` and defers
 * to the shared `readPlanEvents` in `@codebuff/common/util/plan-artifacts` so
 * the CLI and the runtime handler share one parse path.
 */
import path from 'path'

import {
  EVENTS_FILENAME,
  PLAN_EVENT_KINDS,
  isValidPlanSlug,
  readPlanEvents,
  type PlanEvent,
  type PlanEventKind,
} from '@codebuff/common/util/plan-artifacts'

import { getProjectRoot } from '../project-files'
import { existsSync } from 'node:fs'

import {
  defineCommandWithArgs,
  type CommandDefinition,
  type RouterParams,
} from './command-registry'
import { getSystemMessage, getUserMessage } from '../utils/message-history'

/** Re-export the event kinds + filename so callers (e.g. /plan-status banner) can reference them. */
export { EVENTS_FILENAME, PLAN_EVENT_KINDS }

/**
 * Format a sequence of events into a human-readable timeline report.
 * Events are printed in file order (oldest first), which matches the
 * append-only write semantics of `appendPlanEvent`.
 */
export function formatPlanTimelineReport(
  slug: string,
  events: PlanEvent[],
): string {
  if (events.length === 0) {
    return [
      `No events recorded for session "${slug}".`,
      `EVENTS.jsonl is created automatically when update_plan_status runs against this session.`,
    ].join('\n')
  }
  const lines: string[] = [
    `Timeline for ${slug} (${events.length} event${events.length === 1 ? '' : 's'}):`,
  ]
  for (const event of events) {
    const ts = event.ts
    const kind = event.kind.padEnd(16)
    lines.push(`  ${ts}  ${kind}  ${event.summary}`)
  }
  return lines.join('\n')
}

/**
 * Resolve a user-provided session slug to the absolute EVENTS.jsonl path
 * under the project root. Returns null when the slug is invalid or the file
 * does not exist on disk.
 */
export function resolvePlanTimelinePath(slug: string): string | null {
  const trimmed = slug.trim()
  if (!trimmed) return null
  if (!isValidPlanSlug(trimmed)) return null
  const projectRoot = getProjectRoot()
  const eventsPath = path.join(
    projectRoot,
    '.agents',
    'sessions',
    trimmed,
    EVENTS_FILENAME,
  )
  if (!existsSync(eventsPath)) return null
  return eventsPath
}

/**
 * Read events for a session slug, applying an optional kind filter.
 * Returns an empty array when the slug is invalid or EVENTS.jsonl is absent.
 */
export function readPlanTimeline(
  slug: string,
  kind?: PlanEventKind,
): PlanEvent[] {
  const trimmed = slug.trim()
  if (!trimmed) return []
  if (!isValidPlanSlug(trimmed)) return []
  return readPlanEvents(trimmed, kind !== undefined ? { kind } : {})
}

/**
 * Parse the `/plan-timeline` argument string. Supports:
 *   - `/plan-timeline <slug>` — all events
 *   - `/plan-timeline <slug> --kind task_update` — filter to one kind
 *
 * Returns `{ slug, kind }` or null when the slug is missing.
 */
export function parsePlanTimelineArgs(
  args: string,
): { slug: string; kind?: PlanEventKind } | null {
  const trimmed = args.trim()
  if (!trimmed) return null
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  let slug = tokens[0]
  if (!slug) return null
  // Strip a trailing .md if the user pasted a full artifact path by accident.
  if (slug.endsWith('.md')) {
    slug = slug.slice(0, -'.md'.length)
  }
  if (!slug.includes('/') && !slug.startsWith('.')) {
    // bare slug — keep as-is
  } else {
    // normalize leading .agents/sessions/ prefix
    slug = slug.replace(/^\.agents\/sessions\//, '')
    slug = slug.split('/')[0] ?? slug
  }
  let kind: PlanEventKind | undefined
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok === '--kind' || tok === '-k') {
      const next = tokens[i + 1]
      if (next && (PLAN_EVENT_KINDS as readonly string[]).includes(next)) {
        kind = next as PlanEventKind
        i += 1
      }
    }
  }
  return { slug, kind }
}

/**
 * Register the `/plan-timeline` command (alias `tl`).
 *
 * The command reads EVENTS.jsonl for the given session slug and appends a
 * formatted timeline as a local system message. It does not send an agent
 * prompt — it is a read-only inspector like `/plan-status`.
 */
export function registerPlanTimelineCommand(): CommandDefinition {
  return defineCommandWithArgs({
    name: 'plan-timeline',
    aliases: ['tl'],
    handler: (params: RouterParams, args: string) => {
      const parsed = parsePlanTimelineArgs(args)
      params.saveToHistory(params.inputValue.trim())
      if (!parsed) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(
            '/plan-timeline: missing session slug. Usage: /plan-timeline <slug> [--kind task_update|session_status|current_task|append_lesson].',
          ),
        ])
        params.setInputValue({
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: false,
        })
        return
      }
      const resolved = resolvePlanTimelinePath(parsed.slug)
      if (!resolved) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(
            `/plan-timeline: no EVENTS.jsonl found for session "${parsed.slug}". Run update_plan_status against this session first.`,
          ),
        ])
        params.setInputValue({
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: false,
        })
        return
      }
      const events = readPlanTimeline(parsed.slug, parsed.kind)
      const report = formatPlanTimelineReport(parsed.slug, events)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(report),
      ])
      params.setInputValue({
        text: '',
        cursorPosition: 0,
        lastEditDueToNav: false,
      })
      return
    },
  })
}
