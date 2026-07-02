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

/** Lifecycle of a spawned subagent's box. */
export type AgentStatus = 'running' | 'done'

/**
 * A spawned subagent rendered as a collapsible box. Its `blocks` are the
 * subagent's own ordered parts — reasoning, text, tool calls, and (when it
 * spawns its own children) further `agent` parts. The tree nests arbitrarily;
 * in practice base2's subagents go two levels deep (file-picker → file-lister).
 */
export interface AgentPart {
  kind: 'agent'
  /** The subagent's stable id (matches its subagent_start/finish + child events). */
  id: string
  /** The template id, e.g. `file-picker` (drives the icon / default-open rule). */
  agentType: string
  /** Human label shown on the box header, e.g. "Fletcher the File Fetcher". */
  displayName: string
  /** The prompt the parent sent to spawn this agent (shown collapsed + expanded). */
  prompt?: string
  status: AgentStatus
  /** The subagent's own ordered parts (rendered inside the box). */
  blocks: Part[]
}

/**
 * A structured, actionable callout the engine emits instead of plain error text
 * when it knows how the user can recover (e.g. the local Claude Code being
 * signed out). `notice` picks the rendering (title, action buttons) in the UI's
 * NoticeCard; `text` is the full explanation and doubles as the fallback body
 * for notice kinds the renderer doesn't recognize.
 */
export interface NoticePart {
  kind: 'notice'
  id: string
  /** Discriminator for kind-specific rendering, e.g. {@link NOTICE_CLAUDE_CODE_AUTH}. */
  notice: string
  text: string
}

/** Notice kind for "the local Claude Code CLI isn't authenticated" — rendered
 *  as a sign-in recovery card. Lives here (not in the harness) because the
 *  renderer's NoticeCard needs the same value and can't import server modules. */
export const NOTICE_CLAUDE_CODE_AUTH = 'claude-code-auth'

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
  | NoticePart
  | AgentPart

/** The minimal shape of the agent events we fold (a subset of the SDK's events). */
export interface AgentEventLike {
  type: string
  text?: string
  toolName?: string
  toolCallId?: string
  input?: unknown
  /** For `notice`: the notice kind (see {@link NoticePart}). */
  notice?: string
  /** The agent the event belongs to (subagent id, or the root's own type). */
  agentId?: string
  /** For `subagent_start`: the spawning agent's id (root or another subagent). */
  parentAgentId?: string
  agentType?: string
  displayName?: string
  prompt?: string
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

type ReasoningPart = Extract<Part, { kind: 'reasoning' }>

/**
 * Map every reasoning block in the tree (root + nested subagent blocks) through
 * `fn`, recursing into `agent` parts. Returns the same array reference when
 * nothing changed, so callers stay re-render-free on a no-op. The single
 * tree-traversal primitive behind close/collapse/toggle (here and in the store).
 */
export function mapReasoning(parts: Part[], fn: (r: ReasoningPart) => Part): Part[] {
  let changed = false
  const out = parts.map((p) => {
    if (p.kind === 'reasoning') {
      const next = fn(p)
      if (next !== p) changed = true
      return next
    }
    if (p.kind === 'agent') {
      const blocks = mapReasoning(p.blocks, fn)
      if (blocks !== p.blocks) {
        changed = true
        return { ...p, blocks }
      }
    }
    return p
  })
  return changed ? out : parts
}

/** Close every open reasoning block in the tree (turn end). Ref-stable on no-op. */
function closeAllReasoning(parts: Part[]): Part[] {
  return mapReasoning(parts, (r) => (r.open ? { ...r, open: false } : r))
}

/**
 * Find the `agent` part with `id === agentId` anywhere in the tree and replace
 * it with `updater(agent)`. Returns the same array reference when the agent is
 * absent or the updater is a no-op, so callers can skip needless re-renders.
 */
function updateAgent(
  parts: Part[],
  agentId: string,
  updater: (a: AgentPart) => AgentPart,
): Part[] {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.kind !== 'agent') continue
    if (p.id === agentId) {
      const next = updater(p)
      if (next === p) return parts
      const out = parts.slice()
      out[i] = next
      return out
    }
    const nested = updateAgent(p.blocks, agentId, updater)
    if (nested !== p.blocks) {
      const out = parts.slice()
      out[i] = { ...p, blocks: nested }
      return out
    }
  }
  return parts
}

/** Apply a fold to a subagent's `blocks` (by id), immutably. Ref-stable on no-op. */
function updateAgentBlocks(
  parts: Part[],
  agentId: string,
  fold: (blocks: Part[]) => Part[],
): Part[] {
  return updateAgent(parts, agentId, (a) => {
    const blocks = fold(a.blocks)
    return blocks === a.blocks ? a : { ...a, blocks }
  })
}

/**
 * Fold a single text/reasoning/tool event into one scope's ordered parts (the
 * root turn, or one subagent's blocks). Coalesces consecutive deltas of the
 * same kind into the trailing part. Ref-stable on no-op.
 */
function foldLeaf(parts: Part[], ev: AgentEventLike, id: () => string): Part[] {
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
    case 'notice': {
      const base = closeReasoning(parts)
      return [...base, { kind: 'notice', id: id(), notice: ev.notice ?? 'generic', text: ev.text ?? '' }]
    }
    default:
      return parts
  }
}

/**
 * Append one agent event to the ordered parts array. Subagent lifecycle events
 * (`subagent_start` / `subagent_finish`) create and close nested `agent` parts;
 * text/reasoning/tool events carrying a known subagent `agentId` route into that
 * subagent's blocks, while everything else folds into the root scope. Returns
 * the same array reference on a no-op so callers can skip re-renders.
 *
 * This is the single source of truth shared by the server (ThreadEngine, which
 * persists the result) and the client (the store, which streams it live), so a
 * reloaded transcript matches the live one — including the subagent tree.
 */
/** Event types that produce parts and so must be folded; everything else (e.g.
 *  `tool_result`) is ignored. `finish` is handled separately by callers, before
 *  this filter, since it ends the turn rather than appending a part. */
export const FOLDABLE_EVENT_TYPES = new Set([
  'text',
  'reasoning_delta',
  'tool_call',
  'notice',
  'subagent_start',
  'subagent_finish',
])

export function foldAgentEvent(parts: Part[], ev: AgentEventLike, id: () => string): Part[] {
  if (ev.type === 'subagent_start') {
    const agent: AgentPart = {
      kind: 'agent',
      id: ev.agentId ?? id(),
      agentType: ev.agentType ?? 'agent',
      displayName: ev.displayName ?? ev.agentType ?? 'Agent',
      prompt: typeof ev.prompt === 'string' && ev.prompt.trim() ? ev.prompt : undefined,
      status: 'running',
      blocks: [],
    }
    // Nest under the spawning subagent when known; otherwise (the root spawned
    // it) append to the root scope.
    const parentId = ev.parentAgentId
    if (parentId) {
      const nested = updateAgentBlocks(parts, parentId, (b) => [...closeReasoning(b), agent])
      if (nested !== parts) return nested
    }
    return [...closeReasoning(parts), agent]
  }

  if (ev.type === 'subagent_finish' && ev.agentId) {
    return updateAgent(parts, ev.agentId, (a) =>
      a.status === 'done' ? a : { ...a, status: 'done', blocks: closeReasoning(a.blocks) },
    )
  }

  if (ev.type === 'finish') return closeAllReasoning(parts)

  // text / reasoning_delta / tool_call. A known subagent id routes the event
  // into that box; an unknown id (the root agent's own type, which tool_call
  // events carry) falls through to the root scope.
  const agentId = ev.agentId
  if (agentId) {
    const routed = updateAgentBlocks(parts, agentId, (b) => foldLeaf(b, ev, id))
    if (routed !== parts) return routed
  }
  return foldLeaf(parts, ev, id)
}

/** Recursively reset a persisted subtree to its reloaded resting state:
 *  reasoning hidden, subagents marked done. */
function normalizePersisted(parts: Part[]): Part[] {
  return parts.map((p) => {
    if (p.kind === 'reasoning') {
      return { ...p, open: false, collapse: 'hidden' as const, userOpened: false }
    }
    if (p.kind === 'agent') {
      return { ...p, status: 'done' as const, blocks: normalizePersisted(p.blocks) }
    }
    return p
  })
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
  if (m.parts && m.parts.length) return normalizePersisted(m.parts)
  const out: Part[] = []
  if (m.text) out.push({ kind: 'text', text: m.text })
  for (const a of m.acts ?? []) out.push({ kind: 'tool', id: id(), toolName: a.toolName, input: a.input })
  return out
}
