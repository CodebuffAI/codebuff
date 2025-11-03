import type { ChatMessage } from '../types/chat'

export function buildMessageTree(messages: ChatMessage[]): {
  tree: Map<string, ChatMessage[]>
  topLevelMessages: ChatMessage[]
} {
  const messageTree = new Map<string, ChatMessage[]>()
  const topLevelMessages: ChatMessage[] = []

  for (const message of messages) {
    if (message.parentId) {
      const siblings = messageTree.get(message.parentId) ?? []
      siblings.push(message)
      messageTree.set(message.parentId, siblings)
    } else {
      topLevelMessages.push(message)
    }
  }

  return { tree: messageTree, topLevelMessages }
}

export function getDescendantIds(
  agentId: string,
  tree: Map<string, ChatMessage[]>,
): string[] {
  const children = tree.get(agentId) ?? []
  const descendantIds: string[] = []

  for (const child of children) {
    if (child.variant === 'agent') {
      descendantIds.push(child.id)
      descendantIds.push(...getDescendantIds(child.id, tree))
    }
  }

  return descendantIds
}

export function getAncestorIds(
  agentId: string,
  messages: ChatMessage[],
): string[] {
  const agent = messages.find((m) => m.id === agentId)
  if (!agent || !agent.parentId) return []

  const parent = messages.find((m) => m.id === agent.parentId)
  if (!parent || parent.variant !== 'agent') return []

  return [parent.id, ...getAncestorIds(parent.id, messages)]
}

export function isAgentVisible(
  agentId: string,
  messages: ChatMessage[],
  collapsedAgents: Set<string>,
): boolean {
  const agent = messages.find((m) => m.id === agentId)
  if (!agent || agent.variant !== 'agent') return false

  const parent = messages.find((m) => m.id === agent.parentId)
  if (!parent || parent.variant !== 'agent') return true

  if (collapsedAgents.has(parent.id)) return false

  return isAgentVisible(parent.id, messages, collapsedAgents)
}
