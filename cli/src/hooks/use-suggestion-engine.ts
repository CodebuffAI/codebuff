import { useDeferredValue, useEffect, useMemo, useRef } from 'react'

import type { SuggestionItem } from '../components/suggestion-menu'
import type { SlashCommand } from '../data/slash-commands'
import type { LocalAgentInfo } from '../utils/local-agent-registry'

export interface TriggerContext {
  active: boolean
  query: string
  startIndex: number
}

const parseSlashContext = (input: string): TriggerContext => {
  if (!input) {
    return { active: false, query: '', startIndex: -1 }
  }

  const lastNewline = input.lastIndexOf('\n')
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1
  const line = input.slice(lineStart)

  const match = line.match(/^(\s*)\/([^\s]*)$/)
  if (!match) {
    return { active: false, query: '', startIndex: -1 }
  }

  const [, leadingWhitespace, commandSegment] = match
  const startIndex = lineStart + leadingWhitespace.length

  return { active: true, query: commandSegment, startIndex }
}

const parseMentionContext = (input: string): TriggerContext => {
  if (!input) {
    return { active: false, query: '', startIndex: -1 }
  }

  const lastNewline = input.lastIndexOf('\n')
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1
  const line = input.slice(lineStart)

  const atIndex = line.lastIndexOf('@')
  if (atIndex === -1) {
    return { active: false, query: '', startIndex: -1 }
  }

  const beforeChar = atIndex > 0 ? line[atIndex - 1] : ''
  if (beforeChar && !/\s/.test(beforeChar)) {
    return { active: false, query: '', startIndex: -1 }
  }

  const query = line.slice(atIndex + 1)
  if (query.includes(' ') || query.includes('\t')) {
    return { active: false, query: '', startIndex: -1 }
  }

  const startIndex = lineStart + atIndex

  return { active: true, query, startIndex }
}

const filterSlashCommands = (
  commands: SlashCommand[],
  query: string,
): SlashCommand[] => {
  if (!query) {
    return commands
  }

  const normalized = query.toLowerCase()
  const result: SlashCommand[] = []
  const pushUnique = (command: SlashCommand) => {
    if (!result.some((entry) => entry.id === command.id)) {
      result.push(command)
    }
  }

  for (const command of commands) {
    const id = command.id.toLowerCase()
    const aliasList = (command.aliases ?? []).map((alias) =>
      alias.toLowerCase(),
    )

    if (
      id.startsWith(normalized) ||
      aliasList.some((alias) => alias.startsWith(normalized))
    ) {
      pushUnique(command)
    }
  }

  for (const command of commands) {
    const id = command.id.toLowerCase()
    const aliasList = (command.aliases ?? []).map((alias) =>
      alias.toLowerCase(),
    )
    const description = command.description.toLowerCase()

    if (
      id.includes(normalized) ||
      description.includes(normalized) ||
      aliasList.some((alias) => alias.includes(normalized))
    ) {
      pushUnique(command)
    }
  }

  return result
}

const filterAgentMatches = (
  agents: LocalAgentInfo[],
  query: string,
): LocalAgentInfo[] => {
  if (!query) {
    return agents
  }

  const normalized = query.toLowerCase()
  const startsWith: LocalAgentInfo[] = []
  const contains: LocalAgentInfo[] = []
  const seen = new Set<string>()

  const pushUnique = (target: LocalAgentInfo[], agent: LocalAgentInfo) => {
    if (!seen.has(agent.id)) {
      target.push(agent)
      seen.add(agent.id)
    }
  }

  for (const agent of agents) {
    const name = agent.displayName.toLowerCase()
    const id = agent.id.toLowerCase()

    if (name.startsWith(normalized) || id.startsWith(normalized)) {
      pushUnique(startsWith, agent)
      continue
    }
  }

  for (const agent of agents) {
    if (seen.has(agent.id)) continue
    const name = agent.displayName.toLowerCase()
    const id = agent.id.toLowerCase()

    if (name.includes(normalized) || id.includes(normalized)) {
      pushUnique(contains, agent)
    }
  }

  return startsWith.concat(contains)
}

export interface SuggestionEngineResult {
  slashContext: TriggerContext
  mentionContext: TriggerContext
  slashMatches: SlashCommand[]
  agentMatches: LocalAgentInfo[]
  slashSuggestionItems: SuggestionItem[]
  agentSuggestionItems: SuggestionItem[]
}

interface SuggestionEngineOptions {
  inputValue: string
  slashCommands: SlashCommand[]
  localAgents: LocalAgentInfo[]
}

export const useSuggestionEngine = ({
  inputValue,
  slashCommands,
  localAgents,
}: SuggestionEngineOptions): SuggestionEngineResult => {
  const deferredInput = useDeferredValue(inputValue)
  const slashCacheRef = useRef<Map<string, SlashCommand[]>>(
    new Map<string, SlashCommand[]>(),
  )
  const agentCacheRef = useRef<Map<string, LocalAgentInfo[]>>(
    new Map<string, LocalAgentInfo[]>(),
  )

  useEffect(() => {
    slashCacheRef.current.clear()
  }, [slashCommands])

  useEffect(() => {
    agentCacheRef.current.clear()
  }, [localAgents])

  const slashContext = useMemo(
    () => parseSlashContext(deferredInput),
    [deferredInput],
  )

  const mentionContext = useMemo(
    () => parseMentionContext(deferredInput),
    [deferredInput],
  )

  const slashMatches = useMemo(() => {
    if (!slashContext.active) {
      return [] as SlashCommand[]
    }

    const key = slashContext.query.toLowerCase()
    const cached = slashCacheRef.current.get(key)
    if (cached) {
      return cached
    }

    const computed = filterSlashCommands(slashCommands, slashContext.query)
    slashCacheRef.current.set(key, computed)
    return computed
  }, [slashContext, slashCommands])

  const agentMatches = useMemo(() => {
    if (!mentionContext.active) {
      return [] as LocalAgentInfo[]
    }

    const key = mentionContext.query.toLowerCase()
    const cached = agentCacheRef.current.get(key)
    if (cached) {
      return cached
    }

    const computed = filterAgentMatches(localAgents, mentionContext.query)
    agentCacheRef.current.set(key, computed)
    return computed
  }, [mentionContext, localAgents])

  const slashSuggestionItems = useMemo<SuggestionItem[]>(() => {
    return slashMatches.map((command) => ({
      id: command.id,
      label: command.label,
      description: command.description,
    }))
  }, [slashMatches])

  const agentSuggestionItems = useMemo<SuggestionItem[]>(() => {
    return agentMatches.map((agent) => ({
      id: agent.id,
      label: agent.displayName,
      description: agent.id,
    }))
  }, [agentMatches])

  return {
    slashContext,
    mentionContext,
    slashMatches,
    agentMatches,
    slashSuggestionItems,
    agentSuggestionItems,
  }
}
