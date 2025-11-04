import { useDeferredValue, useEffect, useMemo, useRef } from 'react'

import { range } from '../utils/arrays'
import { getSubsequenceIndices } from '../utils/strings'

import type { SuggestionItem } from '../components/suggestion-menu'
import type { SlashCommand } from '../data/slash-commands'
import type { Prettify } from '../types/utils'
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

export type MatchedSlashCommand = Prettify<
  SlashCommand &
    Pick<
      SuggestionItem,
      'descriptionHighlightIndices' | 'labelHighlightIndices'
    >
>

const filterSlashCommands = (
  commands: SlashCommand[],
  query: string,
): MatchedSlashCommand[] => {
  if (!query) {
    return commands
  }

  const normalized = query.toLowerCase()
  const matches: MatchedSlashCommand[] = []
  const seen = new Set<string>()
  let shouldKeepSearching = true
  const pushUnique = (command: MatchedSlashCommand) => {
    if (!seen.has(command.id)) {
      matches.push(command)
      seen.add(command.id)
    }
  }

  // Prefix of ID
  for (const command of commands) {
    if (seen.has(command.id)) continue
    const id = command.id.toLowerCase()
    const aliasList = (command.aliases ?? []).map((alias) =>
      alias.toLowerCase(),
    )

    if (
      id.startsWith(normalized) ||
      aliasList.some((alias) => alias.startsWith(normalized))
    ) {
      if (normalized === id || aliasList.includes(normalized)) {
        shouldKeepSearching = false
      }
      const label = command.label.toLowerCase()
      const firstIndex = label.indexOf(normalized)
      const indices =
        firstIndex === -1
          ? null
          : [...range(firstIndex, firstIndex + normalized.length)]
      pushUnique({
        ...command,
        ...(indices && { labelHighlightIndices: indices }),
      })
    }
  }

  // Substring of ID
  for (const command of commands) {
    if (seen.has(command.id)) continue
    const id = command.id.toLowerCase()
    const aliasList = (command.aliases ?? []).map((alias) =>
      alias.toLowerCase(),
    )

    if (
      id.includes(normalized) ||
      aliasList.some((alias) => alias.includes(normalized))
    ) {
      const label = command.label.toLowerCase()
      const firstIndex = label.indexOf(normalized)
      const indices =
        firstIndex === -1
          ? null
          : [...range(firstIndex, firstIndex + normalized.length)]
      pushUnique({
        ...command,
        ...(indices && {
          labelHighlightIndices: indices,
        }),
      })
    }
  }

  // Substring of description
  for (const command of commands) {
    if (seen.has(command.id)) continue
    const description = command.description.toLowerCase()

    if (description.includes(normalized)) {
      const firstIndex = description.indexOf(normalized)
      const indices =
        firstIndex === -1
          ? null
          : [...range(firstIndex, firstIndex + normalized.length)]
      pushUnique({
        ...command,
        ...(indices && {
          descriptionHighlightIndices: indices,
        }),
      })
    }
  }

  // Breakpoint for filter
  if (!shouldKeepSearching) {
    return matches
  }

  // Subsequence of ID
  for (const command of commands) {
    if (seen.has(command.id)) continue
    const id = command.id.toLowerCase()
    const aliasList = (command.aliases ?? []).map((alias) =>
      alias.toLowerCase(),
    )

    for (const alias of [id, ...aliasList]) {
      const subsequenceIndices = getSubsequenceIndices(alias, normalized)
      if (subsequenceIndices) {
        const label = command.label.toLowerCase()
        const firstIndex = label.indexOf(alias)
        pushUnique({
          ...command,
          ...(firstIndex === -1
            ? null
            : {
                labelHighlightIndices: subsequenceIndices.map(
                  (i) => firstIndex + i,
                ),
              }),
        })
      }
    }
  }

  return matches
}

export type MatchedAgentInfo = Prettify<
  LocalAgentInfo & {
    nameHighlightIndices?: number[] | null
    idHighlightIndices?: number[] | null
  }
>

const filterAgentMatches = (
  agents: LocalAgentInfo[],
  query: string,
): MatchedAgentInfo[] => {
  if (!query) {
    return agents
  }

  const normalized = query.toLowerCase()
  const matches: MatchedAgentInfo[] = []
  const seen = new Set<string>()
  let shouldKeepSearching = true

  const pushUnique = (target: MatchedAgentInfo[], agent: MatchedAgentInfo) => {
    if (!seen.has(agent.id)) {
      target.push(agent)
      seen.add(agent.id)
    }
  }

  // Prefix of ID or name
  for (const agent of agents) {
    const id = agent.id.toLowerCase()

    if (id.startsWith(normalized)) {
      if (normalized === id) {
        shouldKeepSearching = false
      }
      pushUnique(matches, {
        ...agent,
        idHighlightIndices: [...range(normalized.length)],
      })
      continue
    }

    const name = agent.displayName.toLowerCase()
    if (name.startsWith(normalized)) {
      if (normalized === name) {
        shouldKeepSearching = false
      }
      pushUnique(matches, {
        ...agent,
        nameHighlightIndices: [...range(normalized.length)],
      })
    }
  }

  // Substring of ID or name
  for (const agent of agents) {
    if (seen.has(agent.id)) continue
    const id = agent.id.toLowerCase()
    const idFirstIndex = id.indexOf(normalized)
    if (idFirstIndex !== -1) {
      pushUnique(matches, {
        ...agent,
        idHighlightIndices: [
          ...range(idFirstIndex, idFirstIndex + normalized.length),
        ],
      })
      continue
    }

    const name = agent.displayName.toLowerCase()

    const nameFirstIndex = name.indexOf(normalized)
    if (nameFirstIndex !== -1) {
      pushUnique(matches, {
        ...agent,
        nameHighlightIndices: [
          ...range(nameFirstIndex, nameFirstIndex + normalized.length),
        ],
      })
      continue
    }
  }

  // Breakpoint for filter
  if (!shouldKeepSearching) {
    return matches
  }

  // Subsequence of ID or name
  for (const agent of agents) {
    if (seen.has(agent.id)) continue
    const id = agent.id.toLowerCase()
    const idSubsequenceIndices = getSubsequenceIndices(id, normalized)
    if (idSubsequenceIndices) {
      pushUnique(matches, {
        ...agent,
        idHighlightIndices: idSubsequenceIndices,
      })
      continue
    }

    const name = agent.displayName.toLowerCase()
    const nameSubsequenceIndices = getSubsequenceIndices(name, normalized)
    if (nameSubsequenceIndices) {
      pushUnique(matches, {
        ...agent,
        nameHighlightIndices: nameSubsequenceIndices,
      })
    }
  }

  return matches
}

export interface SuggestionEngineResult {
  slashContext: TriggerContext
  mentionContext: TriggerContext
  slashMatches: MatchedSlashCommand[]
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
  const slashCacheRef = useRef<Map<string, MatchedSlashCommand[]>>(
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

  const slashMatches = useMemo<MatchedSlashCommand[]>(() => {
    if (!slashContext.active) {
      return []
    }

    const key = slashContext.query.toLowerCase()
    const cached = slashCacheRef.current.get(key)
    if (cached) {
      return cached
    }

    const matched = filterSlashCommands(slashCommands, slashContext.query)
    slashCacheRef.current.set(key, matched)
    return matched
  }, [slashContext, slashCommands])

  const agentMatches = useMemo<MatchedAgentInfo[]>(() => {
    if (!mentionContext.active) {
      return []
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
      labelHighlightIndices: command.labelHighlightIndices,
      description: command.description,
      descriptionHighlightIndices: command.descriptionHighlightIndices,
    }))
  }, [slashMatches])

  const agentSuggestionItems = useMemo<SuggestionItem[]>(() => {
    return agentMatches.map((agent) => ({
      id: agent.id,
      label: agent.displayName,
      labelHighlightIndices: agent.nameHighlightIndices,
      description: agent.id,
      descriptionHighlightIndices: agent.idHighlightIndices,
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
