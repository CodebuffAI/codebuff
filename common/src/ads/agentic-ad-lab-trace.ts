/**
 * One Agentic Ads Lab batch run as a reviewer reads it: what the agent said,
 * each tool call and its output, the step checks, friction reports and the
 * grade. Built from the run's `freebuff_cloud_event` rows on the server
 * (`labRunTraceEntries`), shown on the Batch runs list and written as a folder
 * of Markdown files by `agentic-ad-lab-batch.ts traces`.
 * Doc: docs/agentic-ads-lab.md, "Traces".
 */

import type { LabRunGrade } from './agentic-ad-lab-batch'
import type { SponsoredStepDriveResult } from './sponsored-step-driver'

export type LabRunTraceEntry =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; input: string }
  /** `name` is the tool the result answers, when the event names it. */
  | { kind: 'result'; name: string | null; output: string }

export type LabRunTrace = {
  workspaceId: string
  slot: number
  /** `owner/name`, or null when the batch no longer lists the project. */
  repository: string | null
  runStatus: string | null
  error: string | null
  signup: string
  grade: LabRunGrade | null
  entries: LabRunTraceEntry[]
  stepChecks: SponsoredStepDriveResult | null
  friction: string[]
  /** The run had more events than a trace reads; the tail is missing. */
  truncated: boolean
}

/** Characters kept of one tool call's input, and of one tool result. */
export const LAB_TRACE_INPUT_CHARS = 2_000
export const LAB_TRACE_OUTPUT_CHARS = 4_000

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}… (${text.length - max} more)` : text

const asText = (value: unknown) =>
  typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? '')

/**
 * The run's events, in order, as text, tool calls and tool results. Adjacent
 * text chunks merge; reasoning and anything else is left out.
 */
export function labRunTraceEntries(
  events: ReadonlyArray<{ kind: string; payload: unknown }>,
): LabRunTraceEntry[] {
  const entries: LabRunTraceEntry[] = []
  for (const { kind, payload } of events) {
    if (kind === 'chunk' && typeof payload === 'string') {
      const last = entries.at(-1)
      if (last?.kind === 'text') last.text += payload
      else entries.push({ kind: 'text', text: payload })
      continue
    }
    if (kind !== 'event' || !payload || typeof payload !== 'object') continue
    const event = payload as {
      type?: unknown
      toolName?: unknown
      input?: unknown
      output?: unknown
    }
    if (event.type === 'tool_call')
      entries.push({
        kind: 'tool',
        name: typeof event.toolName === 'string' ? event.toolName : 'tool',
        input: clip(asText(event.input ?? ''), LAB_TRACE_INPUT_CHARS),
      })
    else if (event.type === 'tool_result')
      entries.push({
        kind: 'result',
        name: typeof event.toolName === 'string' ? event.toolName : null,
        output: clip(asText(event.output ?? ''), LAB_TRACE_OUTPUT_CHARS),
      })
  }
  return entries.filter((e) => e.kind !== 'text' || e.text.trim())
}

/** A one-line verdict for an index: tier and cause, or the run's state. */
export function labRunTraceVerdict(trace: LabRunTrace): string {
  if (trace.grade)
    return `${trace.grade.tier} · ${trace.grade.causeKey}${
      trace.grade.stepsTotal !== null
        ? ` · step ${trace.grade.stepsCompleted ?? 0}/${trace.grade.stepsTotal}`
        : ''
    }`
  return trace.runStatus ?? 'not started'
}

/** Longest fence the text contains, so a block around it is never closed early. */
function fenced(text: string, info = '') {
  const longest = Math.max(
    2,
    ...Array.from(text.matchAll(/`{3,}/g), (m) => m[0].length),
  )
  const fence = '`'.repeat(longest + 1)
  return `${fence}${info}\n${text}\n${fence}`
}

/** The trace as one Markdown file. */
export function labRunTraceMarkdown(
  trace: LabRunTrace,
  batch: { name: string; adName: string },
): string {
  const lines = [
    `# Run ${trace.slot + 1}: ${trace.repository ?? 'unknown repository'}`,
    '',
    `- Batch: ${batch.name} (${batch.adName})`,
    `- Result: ${labRunTraceVerdict(trace)}`,
  ]
  if (trace.grade?.cause) lines.push(`- Cause: ${trace.grade.cause}`)
  if (trace.error) lines.push(`- Run error: ${trace.error}`)
  lines.push(`- Signup question: ${trace.signup}`)
  if (trace.stepChecks) {
    lines.push(
      '',
      `## Step checks (${trace.stepChecks.delivered ? 'delivered' : 'not delivered'}, ${trace.stepChecks.fixes} fixes)`,
      '',
    )
    for (const step of trace.stepChecks.steps) {
      lines.push(
        `${step.number}. **${step.title}**: ${step.status}${step.fixes ? ` (${step.fixes} fixes)` : ''}`,
      )
      for (const check of step.checks)
        lines.push(`   - ${check.status}: ${check.label}. ${check.detail}`)
    }
  }
  if (trace.friction.length)
    lines.push(
      '',
      '## Friction the agent reported',
      '',
      ...trace.friction.map((f) => `- ${f}`),
    )
  lines.push('', '## Transcript', '')
  for (const entry of trace.entries) {
    if (entry.kind === 'text') lines.push(entry.text.trim(), '')
    else if (entry.kind === 'tool')
      lines.push(`**Tool: ${entry.name}**`, '', fenced(entry.input, 'json'), '')
    else
      lines.push(
        entry.name ? `Result of ${entry.name}:` : 'Result:',
        '',
        fenced(entry.output),
        '',
      )
  }
  if (!trace.entries.length) lines.push('_The run recorded no agent output._')
  if (trace.truncated)
    lines.push('', '_The trace stops here: the run has more events than a trace reads._')
  return `${lines.join('\n').trimEnd()}\n`
}
