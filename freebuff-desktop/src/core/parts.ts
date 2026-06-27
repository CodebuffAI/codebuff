/**
 * The ordered "parts" model for an assistant turn.
 *
 * A turn is a single ordered stream of parts — reasoning, prose text, and tool
 * calls — in the exact order they were produced. This mirrors the CLI's
 * `ContentBlock[]` (see `cli/src/types/chat.ts`): one flat array, appended to as
 * events arrive, so reasoning → text → tool → text renders chronologically
 * instead of grouping all tools first and all prose after.
 *
 * `foldAgentEvent` is the single source of truth for turning a stream of agent
 * events into that array. Both the server (ThreadEngine, building what it
 * persists) and the client (the store, building what it streams live) fold the
 * same events the same way, so a reloaded transcript matches the live one.
 */

/** How a reasoning block is shown. UI-only; `preview` shows the last few lines. */
export type ReasoningCollapse = 'preview' | 'expanded' | 'hidden'

export type Part =
  | { kind: 'text'; text: string }
  | {
      kind: 'reasoning'
      id: string
      text: string
      /** True while reasoning is still streaming; closed when text/tool/finish arrives. */
      open: boolean
      collapse: ReasoningCollapse
      /** Set when the user manually expanded it, so auto-collapse leaves it alone. */
      userOpened?: boolean
    }
  | { kind: 'tool'; id: string; toolName: string; input: unknown }

/** The minimal shape of the agent events we fold (a subset of the SDK's events). */
export interface AgentEventLike {
  type: string
  text?: string
  toolName?: string
  toolCallId?: string
  input?: unknown
  [k: string]: unknown
}

const replaceLast = (parts: Part[], part: Part): Part[] => [...parts.slice(0, -1), part]

/** Close the trailing reasoning block (if any is still open). */
function closeReasoning(parts: Part[]): Part[] {
  const last = parts[parts.length - 1]
  if (last?.kind === 'reasoning' && last.open) {
    return replaceLast(parts, { ...last, open: false })
  }
  return parts
}

/**
 * Append one agent event to the ordered parts array, coalescing consecutive
 * deltas of the same kind into the trailing part. Returns the same array
 * reference when the event is a no-op (e.g. an empty text delta) so callers can
 * skip needless re-renders.
 */
export function foldAgentEvent(parts: Part[], ev: AgentEventLike, id: () => string): Part[] {
  switch (ev.type) {
    case 'text': {
      const text = ev.text ?? ''
      if (!text) return parts
      // Prose closes any in-flight reasoning, then merges into the trailing text.
      const base = closeReasoning(parts)
      const tail = base[base.length - 1]
      if (tail?.kind === 'text') return replaceLast(base, { ...tail, text: tail.text + text })
      return [...base, { kind: 'text', text }]
    }
    case 'reasoning_delta': {
      const text = ev.text ?? ''
      if (!text) return parts
      const tail = parts[parts.length - 1]
      if (tail?.kind === 'reasoning' && tail.open) {
        return replaceLast(parts, { ...tail, text: tail.text + text })
      }
      return [...parts, { kind: 'reasoning', id: id(), text, open: true, collapse: 'preview' }]
    }
    case 'tool_call': {
      const base = closeReasoning(parts)
      return [
        ...base,
        { kind: 'tool', id: ev.toolCallId ?? id(), toolName: ev.toolName ?? 'tool', input: ev.input },
      ]
    }
    case 'finish':
      return closeReasoning(parts)
    default:
      return parts
  }
}

/**
 * Reconstruct parts for a persisted message. New messages carry their ordered
 * `parts` verbatim (reasoning collapsed to `hidden` on reload). Legacy messages
 * (persisted before the parts model) only have `text` + `acts`, so fall back to
 * the old layout: prose first, then the tool calls.
 */
export function partsFromPersisted(
  m: { role: string; text: string; acts?: { toolName: string; input: unknown }[]; parts?: Part[] },
  id: () => string,
): Part[] {
  if (m.role === 'user') return m.text ? [{ kind: 'text', text: m.text }] : []
  if (m.parts && m.parts.length) {
    return m.parts.map((p) =>
      p.kind === 'reasoning' ? { ...p, open: false, collapse: 'hidden', userOpened: false } : p,
    )
  }
  const out: Part[] = []
  if (m.text) out.push({ kind: 'text', text: m.text })
  for (const a of m.acts ?? []) out.push({ kind: 'tool', id: id(), toolName: a.toolName, input: a.input })
  return out
}
