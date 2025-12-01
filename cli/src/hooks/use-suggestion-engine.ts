import { promises as fs } from 'fs'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import {
  getAllFilePaths,
  getProjectFileTree,
} from '@codebuff/common/project-file-tree'

import { range } from '../utils/arrays'
import { getProjectRoot } from '../project-files'
import { logger } from '../utils/logger'

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

interface LineInfo {
  lineStart: number
  line: string
}

const getCurrentLineInfo = (
  input: string,
  cursorPosition?: number,
): LineInfo => {
  const upto = cursorPosition ?? input.length
  const textUpTo = input.slice(0, upto)
  const lastNewline = textUpTo.lastIndexOf('\n')
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1
  const line = textUpTo.slice(lineStart)
  return { lineStart, line }
}

const parseSlashContext = (input: string): TriggerContext => {
  if (!input) {
    return { active: false, query: '', startIndex: -1 }
  }

  const { lineStart, line } = getCurrentLineInfo(input)

  const match = line.match(/^(\s*)\/([^\s]*)$/)
  if (!match) {
    return { active: false, query: '', startIndex: -1 }
  }

  const [, leadingWhitespace, commandSegment] = match
  const startIndex = lineStart + leadingWhitespace.length

  // Slash commands only activate on the first line (startIndex must be 0)
  if (startIndex !== 0) {
    return { active: false, query: '', startIndex: -1 }
  }

  return { active: true, query: commandSegment, startIndex }
}

interface MentionParseResult {
  active: boolean
  query: string
  atIndex: number
}

// Helper to check if a position is inside quotes
const isInsideQuotes = (text: string, position: number): boolean => {
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false

  for (let i = 0; i < position; i++) {
    const char = text[i]
    
    // Check if this character is escaped by counting preceding backslashes
    let numBackslashes = 0
    let j = i - 1
    while (j >= 0 && text[j] === '\\') {
      numBackslashes++
      j--
    }
    
    // If there's an odd number of backslashes, the character is escaped
    const isEscaped = numBackslashes % 2 === 1

    if (!isEscaped) {
      if (char === "'" && !inDoubleQuote && !inBacktick) {
        inSingleQuote = !inSingleQuote
      } else if (char === '"' && !inSingleQuote && !inBacktick) {
        inDoubleQuote = !inDoubleQuote
      } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inBacktick = !inBacktick
      }
    }
  }

  return inSingleQuote || inDoubleQuote || inBacktick
}

const parseAtInLine = (line: string): MentionParseResult => {
  const atIndex = line.lastIndexOf('@')
  if (atIndex === -1) {
    return { active: false, query: '', atIndex: -1 }
  }

  // Check if @ is inside quotes
  if (isInsideQuotes(line, atIndex)) {
    return { active: false, query: '', atIndex: -1 }
  }

  const beforeChar = atIndex > 0 ? line[atIndex - 1] : ''
  
  // Don't trigger on escaped @: \@
  if (beforeChar === '\\') {
    return { active: false, query: '', atIndex: -1 }
  }

  // Don't trigger on email-like patterns or URLs: user@example.com, https://example.com/@user
  // Check for alphanumeric, dot, or colon before @
  if (beforeChar && /[a-zA-Z0-9.:]/.test(beforeChar)) {
    return { active: false, query: '', atIndex: -1 }
  }

  // Require whitespace or start of line before @
  if (beforeChar && !/\s/.test(beforeChar)) {
    return { active: false, query: '', atIndex: -1 }
  }

  const afterAt = line.slice(atIndex + 1)
  const firstSpaceIndex = afterAt.search(/\s/)
  const query = firstSpaceIndex === -1 ? afterAt : afterAt.slice(0, firstSpaceIndex)

  if (firstSpaceIndex !== -1) {
    return { active: false, query: '', atIndex: -1 }
  }

  return { active: true, query, atIndex }
}

const parseMentionContext = (
  input: string,
  cursorPosition: number,
): TriggerContext => {
  if (!input) {
    return { active: false, query: '', startIndex: -1 }
  }

  const { lineStart, line } = getCurrentLineInfo(input, cursorPosition)
  const { active, query, atIndex } = parseAtInLine(line)

  if (!active) {
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
  const pushUnique = createPushUnique<MatchedSlashCommand, string>(
    (command) => command.id,
    seen,
  )
  let shouldKeepSearching = true

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
          : createHighlightIndices(firstIndex, firstIndex + normalized.length)
      pushUnique(matches, {
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
          : createHighlightIndices(firstIndex, firstIndex + normalized.length)
      pushUnique(matches, {
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
          : createHighlightIndices(firstIndex, firstIndex + normalized.length)
      pushUnique(matches, {
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

const flattenFileTree = (nodes: FileTreeNode[]): string[] =>
  getAllFilePaths(nodes)

const getFileName = (filePath: string): string => {
  const lastSlash = filePath.lastIndexOf('/')
  return lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1)
}

const createHighlightIndices = (start: number, end: number): number[] => [
  ...range(start, end),
]

const createPushUnique = <T, K>(
  getKey: (item: T) => K,
  seen: Set<K>,
) => {
  return (target: T[], item: T) => {
    const key = getKey(item)
    if (!seen.has(key)) {
      target.push(item)
      seen.add(key)
    }
  }
}

const filterFileMatches = (
  filePaths: string[],
  query: string,
): MatchedFileInfo[] => {
  if (!query) {
    return []
  }

  const normalized = query.toLowerCase()
  const matches: MatchedFileInfo[] = []
  const seen = new Set<string>()

  const pushUnique = createPushUnique<MatchedFileInfo, string>(
    (file) => file.filePath,
    seen,
  )

  // Check if query contains slashes for path-segment matching
  const querySegments = normalized.split('/')
  const hasSlashes = querySegments.length > 1

  // Helper to calculate the longest contiguous match length in the file path
  const calculateContiguousMatchLength = (filePath: string): number => {
    const pathLower = filePath.toLowerCase()
    let maxContiguousLength = 0

    // Try to find the longest contiguous substring that matches the query pattern
    for (let i = 0; i < pathLower.length; i++) {
      let matchLength = 0
      let queryIdx = 0
      let pathIdx = i

      // Try to match as many characters as possible from this position
      while (pathIdx < pathLower.length && queryIdx < normalized.length) {
        if (pathLower[pathIdx] === normalized[queryIdx]) {
          matchLength++
          queryIdx++
          pathIdx++
        } else {
          break
        }
      }

      maxContiguousLength = Math.max(maxContiguousLength, matchLength)
    }

    return maxContiguousLength
  }

  // Helper to match path segments
  const matchPathSegments = (filePath: string): number[] | null => {
    const pathLower = filePath.toLowerCase()
    const highlightIndices: number[] = []
    let searchStart = 0

    for (const segment of querySegments) {
      if (!segment) continue
      
      const segmentIndex = pathLower.indexOf(segment, searchStart)
      if (segmentIndex === -1) {
        return null
      }

      // Add highlight indices for this segment
      for (let i = 0; i < segment.length; i++) {
        highlightIndices.push(segmentIndex + i)
      }

      searchStart = segmentIndex + segment.length
    }

    return highlightIndices
  }

  if (hasSlashes) {
    // Slash-separated path matching
    for (const filePath of filePaths) {
      const highlightIndices = matchPathSegments(filePath)
      if (highlightIndices) {
        pushUnique(matches, {
          filePath,
          pathHighlightIndices: highlightIndices,
        })
      }
    }

    // Sort by contiguous match length (longest first)
    matches.sort((a, b) => {
      const aLength = calculateContiguousMatchLength(a.filePath)
      const bLength = calculateContiguousMatchLength(b.filePath)
      return bLength - aLength
    })
  } else {
    // Original logic for non-slash queries
    
    // Prefix of file name
    for (const filePath of filePaths) {
      const fileName = getFileName(filePath)
      const fileNameLower = fileName.toLowerCase()

      if (fileNameLower.startsWith(normalized)) {
        pushUnique(matches, {
          filePath,
          pathHighlightIndices: createHighlightIndices(
            filePath.lastIndexOf(fileName),
            filePath.lastIndexOf(fileName) + normalized.length,
          ),
        })
        continue
      }

      const path = filePath.toLowerCase()
      if (path.startsWith(normalized)) {
        pushUnique(matches, {
          filePath,
          pathHighlightIndices: createHighlightIndices(0, normalized.length),
        })
      }
    }

    // Substring of file name or path
    for (const filePath of filePaths) {
      if (seen.has(filePath)) continue
      const path = filePath.toLowerCase()
      const fileName = getFileName(filePath)
      const fileNameLower = fileName.toLowerCase()

      const fileNameIndex = fileNameLower.indexOf(normalized)
      if (fileNameIndex !== -1) {
        const actualFileNameStart = filePath.lastIndexOf(fileName)
        pushUnique(matches, {
          filePath,
          pathHighlightIndices: createHighlightIndices(
            actualFileNameStart + fileNameIndex,
            actualFileNameStart + fileNameIndex + normalized.length,
          ),
        })
        continue
      }

      const pathIndex = path.indexOf(normalized)
      if (pathIndex !== -1) {
        pushUnique(matches, {
          filePath,
          pathHighlightIndices: createHighlightIndices(
            pathIndex,
            pathIndex + normalized.length,
          ),
        })
      }
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
  const pushUnique = createPushUnique<MatchedAgentInfo, string>(
    (agent) => agent.id,
    seen,
  )
  let shouldKeepSearching = true

  // Prefix of ID or name
  for (const agent of agents) {
    const id = agent.id.toLowerCase()

    if (id.startsWith(normalized)) {
      if (normalized === id) {
        shouldKeepSearching = false
      }
      pushUnique(matches, {
        ...agent,
        idHighlightIndices: createHighlightIndices(0, normalized.length),
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
        nameHighlightIndices: createHighlightIndices(0, normalized.length),
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
        idHighlightIndices: createHighlightIndices(
          idFirstIndex,
          idFirstIndex + normalized.length,
        ),
      })
      continue
    }

    const name = agent.displayName.toLowerCase()

    const nameFirstIndex = name.indexOf(normalized)
    if (nameFirstIndex !== -1) {
      pushUnique(matches, {
        ...agent,
        nameHighlightIndices: createHighlightIndices(
          nameFirstIndex,
          nameFirstIndex + normalized.length,
        ),
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
  disableAgentSuggestions?: boolean
}

export const useSuggestionEngine = ({
  inputValue,
  cursorPosition,
  slashCommands,
  localAgents,
  fileTree,
  disableAgentSuggestions = false,
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
  const fileRefreshIdRef = useRef(0)
  const [filePaths, setFilePaths] = useState<string[]>(() =>
    flattenFileTree(fileTree),
  )

  useEffect(() => {
    slashCacheRef.current.clear()
  }, [slashCommands])

  useEffect(() => {
    agentCacheRef.current.clear()
  }, [localAgents])

  useEffect(() => {
    fileCacheRef.current.clear()
  }, [filePaths])

  useEffect(() => {
    setFilePaths(flattenFileTree(fileTree))
  }, [fileTree])

  const slashContext = useMemo(
    () => parseSlashContext(deferredInput),
    [deferredInput],
  )

  const mentionContext = useMemo(
    () => parseMentionContext(deferredInput, cursorPosition),
    [deferredInput, cursorPosition],
  )

  useEffect(() => {
    if (!mentionContext.active) {
      return
    }

    const requestId = ++fileRefreshIdRef.current
    let cancelled = false

    const refreshFilePaths = async () => {
      try {
        const projectRoot = getProjectRoot()
        const freshTree = await getProjectFileTree({
          projectRoot,
          fs,
        })

        if (cancelled || fileRefreshIdRef.current !== requestId) {
          return
        }

        setFilePaths(flattenFileTree(freshTree))
      } catch (error) {
        logger.debug({ error }, 'Failed to refresh file suggestions from disk')
      }
    }

    void refreshFilePaths()

    return () => {
      cancelled = true
    }
  }, [mentionContext.active])

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
    if (!mentionContext.active || disableAgentSuggestions) {
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
  }, [mentionContext, localAgents, disableAgentSuggestions])

  const fileMatches = useMemo<MatchedFileInfo[]>(() => {
    if (!mentionContext.active) {
      return []
    }

    const key = mentionContext.query.toLowerCase()
    const cached = fileCacheRef.current.get(key)
    if (cached) {
      return cached
    }

    const computed = filterFileMatches(filePaths, mentionContext.query)
    fileCacheRef.current.set(key, computed)
    return computed
  }, [mentionContext, filePaths])

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
      const fileName = getFileName(file.filePath)
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
