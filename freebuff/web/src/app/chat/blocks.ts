/**
 * Block tree for assistant messages with subagent activity.
 *
 * The stream route normalizes SDK events into ChatStreamEvent and both sides
 * fold them into the same tree with BlockTreeBuilder: the client renders it
 * live while streaming, the server persists the final tree on chat_message
 * so reloads show the same thing. Agent blocks nest arbitrarily via
 * parentAgentId (in practice two levels today).
 */

import type { SuggestFollowup } from '@codebuff/common/tools/params/tool/suggest-followups'

export type TextBlock = { type: 'text'; text: string }

export type ThinkingBlock = {
  type: 'thinking'
  text: string
  /** Running while reasoning tokens are still streaming into this block. */
  status: 'running' | 'done'
}

/** Input-dependent status verbs (e.g. "Finding services"/"Found services" for
 *  a gravity_index search). Tools without verbs fall back to per-tool-name
 *  defaults in the UI. */
export type ToolVerbs = { running: string; done: string }

export type ToolBlock = {
  type: 'tool'
  toolCallId: string
  toolName: string
  /** Human-readable summary of the call, e.g. the search query or URL. */
  label: string
  verbs?: ToolVerbs
  status: 'running' | 'done'
}

export type AgentBlock = {
  type: 'agent'
  agentId: string
  /** Display name, e.g. "Researcher". */
  name: string
  agentType: string
  prompt?: string
  status: 'running' | 'done'
  blocks: ChatBlock[]
}

/** One clickable followup the agent suggested via suggest_followups. `prompt`
 *  is the full text sent as the next user message; `label` is the short title
 *  shown on the card (the prompt is revealed on hover). Re-exported from the
 *  tool's own schema type so the shape stays in lockstep with the tool. */
export type SuggestedFollowup = SuggestFollowup

/** Clickable followup prompts the agent suggested for this turn (rendered under
 *  the latest assistant message; interactive only there). */
export type SuggestionsBlock = {
  type: 'suggestions'
  toolCallId: string
  followups: SuggestedFollowup[]
}

export type ChatBlock =
  | TextBlock
  | ThinkingBlock
  | ToolBlock
  | AgentBlock
  | SuggestionsBlock

/** Normalized streaming events sent over SSE (alongside meta/error/done). */
export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'agent_reasoning_delta'; agentId: string; text: string }
  | {
      type: 'agent_start'
      agentId: string
      parentAgentId?: string
      name: string
      agentType: string
      prompt?: string
    }
  | { type: 'agent_delta'; agentId: string; text: string }
  | { type: 'agent_finish'; agentId: string }
  | {
      type: 'agent_tool'
      /** Omitted for the root agent's own tool calls, which render as
       *  top-level rows rather than inside an agent box. */
      agentId?: string
      toolCallId: string
      toolName: string
      label: string
      verbs?: ToolVerbs
    }
  | { type: 'agent_tool_done'; toolCallId: string }
  | {
      type: 'suggestions'
      toolCallId: string
      followups: SuggestedFollowup[]
    }

const CHAT_STREAM_EVENT_TYPES = new Set<string>([
  'delta',
  'reasoning_delta',
  'agent_reasoning_delta',
  'agent_start',
  'agent_delta',
  'agent_finish',
  'agent_tool',
  'agent_tool_done',
  'suggestions',
] satisfies ChatStreamEvent['type'][])

/** Picks block-tree events out of the SSE stream (which also carries
 *  meta/error/done). */
export function isChatStreamEvent(event: {
  type: string
}): event is ChatStreamEvent {
  return CHAT_STREAM_EVENT_TYPES.has(event.type)
}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

/** Human-readable summary of a tool call (label shown next to the status
 *  verb), plus input-dependent verbs for tools whose action varies. */
export function toolCallDisplay(
  toolName: string,
  input: Record<string, unknown>,
): { label: string; verbs?: ToolVerbs } {
  if (toolName === 'web_search') {
    return { label: asTrimmedString(input.query) }
  }
  if (toolName === 'read_url') {
    return { label: asTrimmedString(input.url) }
  }
  if (toolName === 'gravity_index') {
    switch (input.action) {
      case 'search':
        return {
          label: asTrimmedString(input.query),
          verbs: { running: 'Finding services', done: 'Found services' },
        }
      case 'browse':
        return {
          label: [asTrimmedString(input.category), asTrimmedString(input.q)]
            .filter(Boolean)
            .join(' · '),
          verbs: { running: 'Browsing services', done: 'Browsed services' },
        }
      case 'list_categories':
        return {
          label: '',
          verbs: {
            running: 'Listing service categories',
            done: 'Listed service categories',
          },
        }
      case 'get_service':
        return {
          label: asTrimmedString(input.slug),
          verbs: { running: 'Fetching service', done: 'Fetched service' },
        }
      case 'report_integration':
        return {
          label: asTrimmedString(input.integrated_slug),
          verbs: {
            running: 'Reporting integration',
            done: 'Reported integration',
          },
        }
    }
  }
  return { label: '' }
}

/** Any non-reasoning content ends the current run of thinking, so later
 *  reasoning starts a fresh block instead of merging into the old one. */
function closeOpenThinking(blocks: ChatBlock[]) {
  const last = blocks[blocks.length - 1]
  if (last?.type === 'thinking' && last.status === 'running') {
    last.status = 'done'
  }
}

function appendText(blocks: ChatBlock[], text: string) {
  closeOpenThinking(blocks)
  const last = blocks[blocks.length - 1]
  if (last?.type === 'text') {
    last.text += text
  } else {
    blocks.push({ type: 'text', text })
  }
}

function appendThinking(blocks: ChatBlock[], text: string) {
  const last = blocks[blocks.length - 1]
  if (last?.type === 'thinking' && last.status === 'running') {
    last.text += text
  } else {
    blocks.push({ type: 'thinking', text, status: 'running' })
  }
}

export class BlockTreeBuilder {
  readonly blocks: ChatBlock[] = []
  private readonly agents = new Map<string, AgentBlock>()
  private readonly tools = new Map<string, ToolBlock>()

  apply(event: ChatStreamEvent) {
    switch (event.type) {
      case 'delta': {
        appendText(this.blocks, event.text)
        break
      }
      case 'reasoning_delta': {
        appendThinking(this.blocks, event.text)
        break
      }
      case 'agent_reasoning_delta': {
        const agent = this.agents.get(event.agentId)
        if (agent) appendThinking(agent.blocks, event.text)
        break
      }
      case 'agent_start': {
        const agent: AgentBlock = {
          type: 'agent',
          agentId: event.agentId,
          name: event.name,
          agentType: event.agentType,
          prompt: event.prompt,
          status: 'running',
          blocks: [],
        }
        const parent = event.parentAgentId
          ? this.agents.get(event.parentAgentId)
          : undefined
        const siblings = parent?.blocks ?? this.blocks
        closeOpenThinking(siblings)
        siblings.push(agent)
        this.agents.set(event.agentId, agent)
        break
      }
      case 'agent_delta': {
        const agent = this.agents.get(event.agentId)
        if (agent) appendText(agent.blocks, event.text)
        break
      }
      case 'agent_tool': {
        const tool: ToolBlock = {
          type: 'tool',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          label: event.label,
          ...(event.verbs ? { verbs: event.verbs } : {}),
          status: 'running',
        }
        if (event.agentId) {
          // Tool calls attributed to an agent we never saw start are dropped.
          const agent = this.agents.get(event.agentId)
          if (!agent) break
          closeOpenThinking(agent.blocks)
          agent.blocks.push(tool)
        } else {
          // The root agent's own tool calls render as top-level rows.
          closeOpenThinking(this.blocks)
          this.blocks.push(tool)
        }
        this.tools.set(event.toolCallId, tool)
        break
      }
      case 'agent_tool_done': {
        const tool = this.tools.get(event.toolCallId)
        if (tool) tool.status = 'done'
        break
      }
      case 'agent_finish': {
        const agent = this.agents.get(event.agentId)
        if (agent) {
          agent.status = 'done'
          closeOpenThinking(agent.blocks)
        }
        break
      }
      case 'suggestions': {
        closeOpenThinking(this.blocks)
        // Only the latest set is ever shown, so replace any prior block rather
        // than stacking (an agent could call suggest_followups more than once).
        // The "latest turn only" half of that policy is the render gate in
        // agent-blocks.tsx (BlockList renders this block only when `latest`).
        const block: SuggestionsBlock = {
          type: 'suggestions',
          toolCallId: event.toolCallId,
          followups: event.followups,
        }
        const existing = this.blocks.findIndex((b) => b.type === 'suggestions')
        if (existing >= 0) this.blocks[existing] = block
        else this.blocks.push(block)
        break
      }
    }
  }

  /** True once the turn needs block rendering — a subagent, tool call, or
   *  any thinking. Pure-text turns stay on the plain `content` path. (Agent
   *  thinking lives inside an agent block, so checking the root suffices.) */
  get hasActivityBlocks() {
    return (
      this.agents.size > 0 ||
      this.tools.size > 0 ||
      this.blocks.some(
        (b) => b.type === 'thinking' || b.type === 'suggestions',
      )
    )
  }

  /** The root agent's own text (excludes subagent output) — what gets
   *  persisted as the message `content`. */
  get rootText() {
    return this.blocks
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
  }

  /** The run is over; nothing should still show as running. */
  finalize() {
    for (const agent of this.agents.values()) agent.status = 'done'
    for (const tool of this.tools.values()) tool.status = 'done'
    const closeAll = (blocks: ChatBlock[]) => {
      for (const block of blocks) {
        if (block.type === 'thinking') block.status = 'done'
        if (block.type === 'agent') closeAll(block.blocks)
      }
    }
    closeAll(this.blocks)
  }

  /** Immutable copy safe to hand to React state. */
  snapshot(): ChatBlock[] {
    return structuredClone(this.blocks)
  }
}

/** Type guard for blocks JSON loaded back from the database. */
export function isChatBlockArray(value: unknown): value is ChatBlock[] {
  return (
    Array.isArray(value) &&
    value.every(
      (b) =>
        b &&
        typeof b === 'object' &&
        ['text', 'thinking', 'tool', 'agent', 'suggestions'].includes(
          (b as { type?: string }).type ?? '',
        ),
    )
  )
}
