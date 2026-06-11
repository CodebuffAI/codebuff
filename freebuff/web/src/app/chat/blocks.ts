/**
 * Block tree for assistant messages with subagent activity.
 *
 * The stream route normalizes SDK events into ChatStreamEvent and both sides
 * fold them into the same tree with BlockTreeBuilder: the client renders it
 * live while streaming, the server persists the final tree on chat_message
 * so reloads show the same thing. Agent blocks nest arbitrarily via
 * parentAgentId (in practice two levels today).
 */

export type TextBlock = { type: 'text'; text: string }

export type ToolBlock = {
  type: 'tool'
  toolCallId: string
  toolName: string
  /** Human-readable summary of the call, e.g. the search query or URL. */
  label: string
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

export type ChatBlock = TextBlock | ToolBlock | AgentBlock

/** Normalized streaming events sent over SSE (alongside meta/error/done). */
export type ChatStreamEvent =
  | { type: 'delta'; text: string }
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
      agentId: string
      toolCallId: string
      toolName: string
      label: string
    }
  | { type: 'agent_tool_done'; toolCallId: string }

const CHAT_STREAM_EVENT_TYPES = new Set<string>([
  'delta',
  'agent_start',
  'agent_delta',
  'agent_finish',
  'agent_tool',
  'agent_tool_done',
] satisfies ChatStreamEvent['type'][])

/** Picks block-tree events out of the SSE stream (which also carries
 *  meta/error/done). */
export function isChatStreamEvent(event: {
  type: string
}): event is ChatStreamEvent {
  return CHAT_STREAM_EVENT_TYPES.has(event.type)
}

/** Human-readable summary of a subagent tool call, shown in ToolBlock rows. */
export function toolCallLabel(
  toolName: string,
  input: Record<string, unknown>,
): string {
  if (toolName === 'web_search' && typeof input.query === 'string') {
    return input.query
  }
  if (toolName === 'read_url' && typeof input.url === 'string') {
    return input.url
  }
  return ''
}

function appendText(blocks: ChatBlock[], text: string) {
  const last = blocks[blocks.length - 1]
  if (last?.type === 'text') {
    last.text += text
  } else {
    blocks.push({ type: 'text', text })
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
        ;(parent?.blocks ?? this.blocks).push(agent)
        this.agents.set(event.agentId, agent)
        break
      }
      case 'agent_delta': {
        const agent = this.agents.get(event.agentId)
        if (agent) appendText(agent.blocks, event.text)
        break
      }
      case 'agent_tool': {
        const agent = this.agents.get(event.agentId)
        if (!agent) break
        const tool: ToolBlock = {
          type: 'tool',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          label: event.label,
          status: 'running',
        }
        agent.blocks.push(tool)
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
        if (agent) agent.status = 'done'
        break
      }
    }
  }

  /** True once any subagent has appeared (plain-text turns skip blocks). */
  get hasAgentBlocks() {
    return this.agents.size > 0
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
        ['text', 'tool', 'agent'].includes((b as { type?: string }).type ?? ''),
    )
  )
}
