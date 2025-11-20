import { useDeferredValue, useEffect, useMemo, useRef } from 'react'

import { range } from '../utils/arrays'

import type { SuggestionItem } from '../components/suggestion-menu'
import type { SlashCommand } from '../data/slash-commands'
import type { Prettify } from '../types/utils'
import type { LocalAgentInfo } from '../utils/local-agent-registry'
import type { FileTreeNode } from '@codebuff/common/util/file'

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

const parseMentionContext = (input: string, cursorPosition: number): TriggerContext => {
  if (!input) {
    return { active: false, query: '', startIndex: -1 }
  }

  const lastNewline = input.lastIndexOf('\n')
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1
  
  // Only look at text up to cursor position to find the relevant @
  const textUpToCursor = input.slice(0, cursorPosition)
  const lineUpToCursor = textUpToCursor.slice(lineStart)

  const atIndex = lineUpToCursor.lastIndexOf('@')
  if (atIndex === -1) {
    return { active: false, query: '', startIndex: -1 }
  }

  const beforeChar = atIndex > 0 ? lineUpToCursor[atIndex - 1] : ''
  if (beforeChar && !/\s/.test(beforeChar)) {
    return { active: false, query: '', startIndex: -1 }
  }

  // Extract query from @ until the next whitespace or cursor position
  const afterAt = lineUpToCursor.slice(atIndex + 1)
  const firstSpaceIndex = afterAt.search(/\s/)
  const query = firstSpaceIndex === -1 ? afterAt : afterAt.slice(0, firstSpaceIndex)

  // If we found a space in the query, the mention is complete - don't show menu
  if (firstSpaceIndex !== -1) {
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

  return matches
}

export type MatchedAgentInfo = Prettify<
  LocalAgentInfo & {
    nameHighlightIndices?: number[] | null
    idHighlightIndices?: number[] | null
  }
>

export type MatchedFileInfo = Prettify<{
  filePath: string
  pathHighlightIndices?: number[] | null
}>

const filterFileMatches = (
  files: FileTreeNode[],
  query: string,
): MatchedFileInfo[] => {
  if (!query) {
    return []
  }

  // Flatten the file tree to get all file paths
  const flattenFiles = (nodes: FileTreeNode[]): string[] => {
    const result: string[] = []
    for (const node of nodes) {
      if (node.type === 'file') {
        result.push(node.filePath)
      } else if (node.type === 'directory' && node.children) {
        result.push(...flattenFiles(node.children))
      }
    }
    return result
  }

  const allFilePaths = flattenFiles(files)
  const normalized = query.toLowerCase()
  const matches: MatchedFileInfo[] = []
  const seen = new Set<string>()
  let shouldKeepSearching = true

  const pushUnique = (target: MatchedFileInfo[], file: MatchedFileInfo) => {
    if (!seen.has(file.filePath)) {
      target.push(file)
      seen.add(file.filePath)
    }
  }

  // Prefix of file path
  for (const filePath of allFilePaths) {
    const path = filePath.toLowerCase()
    const fileName = filePath.split('/').pop() || ''
    const fileNameLower = fileName.toLowerCase()

    if (fileNameLower.startsWith(normalized)) {
      if (normalized === fileNameLower) {
        shouldKeepSearching = false
      }
      pushUnique(matches, {
        filePath,
        pathHighlightIndices: [
          ...range(
            filePath.lastIndexOf(fileName),
            filePath.lastIndexOf(fileName) + normalized.length,
          ),
        ],
      })
      continue
    }

    if (path.startsWith(normalized)) {
      pushUnique(matches, {
        filePath,
        pathHighlightIndices: [...range(normalized.length)],
      })
    }
  }

  // Substring of file name or path
  for (const filePath of allFilePaths) {
    if (seen.has(filePath)) continue
    const path = filePath.toLowerCase()
    const fileName = filePath.split('/').pop() || ''
    const fileNameLower = fileName.toLowerCase()

    const fileNameIndex = fileNameLower.indexOf(normalized)
    if (fileNameIndex !== -1) {
      const actualFileNameStart = filePath.lastIndexOf(fileName)
      pushUnique(matches, {
        filePath,
        pathHighlightIndices: [
          ...range(
            actualFileNameStart + fileNameIndex,
            actualFileNameStart + fileNameIndex + normalized.length,
          ),
        ],
      })
      continue
    }

    const pathIndex = path.indexOf(normalized)
    if (pathIndex !== -1) {
      pushUnique(matches, {
        filePath,
        pathHighlightIndices: [
          ...range(pathIndex, pathIndex + normalized.length),
        ],
      })
    }
  }

  return matches
}

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

  return matches
}

export interface SuggestionEngineResult {
  slashContext: TriggerContext
  mentionContext: TriggerContext
  slashMatches: MatchedSlashCommand[]
  agentMatches: MatchedAgentInfo[]
  fileMatches: MatchedFileInfo[]
  slashSuggestionItems: SuggestionItem[]
  agentSuggestionItems: SuggestionItem[]
  fileSuggestionItems: SuggestionItem[]
}

interface SuggestionEngineOptions {
  inputValue: string
  cursorPosition: number
  slashCommands: SlashCommand[]
  localAgents: LocalAgentInfo[]
  fileTree: FileTreeNode[]
}

export const useSuggestionEngine = ({
  inputValue,
  cursorPosition,
  slashCommands,
  localAgents,
  fileTree,
}: SuggestionEngineOptions): SuggestionEngineResult => {
  const deferredInput = useDeferredValue(inputValue)
  const slashCacheRef = useRef<Map<string, MatchedSlashCommand[]>>(
    new Map<string, SlashCommand[]>(),
  )
  const agentCacheRef = useRef<Map<string, MatchedAgentInfo[]>>(
    new Map<string, MatchedAgentInfo[]>(),
  )
  const fileCacheRef = useRef<Map<string, MatchedFileInfo[]>>(
    new Map<string, MatchedFileInfo[]>(),
  )

  useEffect(() => {
    slashCacheRef.current.clear()
  }, [slashCommands])

  useEffect(() => {
    agentCacheRef.current.clear()
  }, [localAgents])

  useEffect(() => {
    fileCacheRef.current.clear()
  }, [fileTree])

  const slashContext = useMemo(
    () => parseSlashContext(deferredInput),
    [deferredInput],
  )

  const mentionContext = useMemo(
    () => parseMentionContext(deferredInput, cursorPosition),
    [deferredInput, cursorPosition],
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

  const fileMatches = useMemo<MatchedFileInfo[]>(() => {
    if (!mentionContext.active) {
      return []
    }

    const key = mentionContext.query.toLowerCase()
    const cached = fileCacheRef.current.get(key)
    if (cached) {
      return cached
    }

    const computed = filterFileMatches(fileTree, mentionContext.query)
    fileCacheRef.current.set(key, computed)
    return computed
  }, [mentionContext, fileTree])

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

  const fileSuggestionItems = useMemo<SuggestionItem[]>(() => {
    return fileMatches.map((file) => {
      const fileName = file.filePath.split('/').pop() || file.filePath
      const isRootLevel = !file.filePath.includes('/')
      
      return {
        id: file.filePath,
        label: fileName,
        labelHighlightIndices: file.pathHighlightIndices
          ? file.pathHighlightIndices.map((idx) => {
              const fileNameStart = file.filePath.lastIndexOf(fileName)
              return idx >= fileNameStart ? idx - fileNameStart : -1
            }).filter((idx) => idx >= 0)
          : null,
        description: isRootLevel ? '.' : file.filePath,
        descriptionHighlightIndices: isRootLevel ? null : file.pathHighlightIndices,
      }
    })
  }, [fileMatches])

  return {
    slashContext,
    mentionContext,
    slashMatches,
    agentMatches,
    fileMatches,
    slashSuggestionItems,
    agentSuggestionItems,
    fileSuggestionItems,
  }
}
