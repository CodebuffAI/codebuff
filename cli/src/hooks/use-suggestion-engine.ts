import { promises as fs } from 'fs'

import { getProjectFileTree } from '@codebuff/common/project-file-tree'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { getProjectRoot } from '../project-files'
import { logger } from '../utils/logger'
import {
  filterAgentMatches,
  filterFileMatches,
  filterSlashCommands,
  flattenFileTree,
  getFileName,
} from '../utils/suggestion-filtering'
import {
  parseMentionContext,
  parseSlashContext,
} from '../utils/suggestion-parsing'

import type { SuggestionItem } from '../components/suggestion-menu'
import type { SlashCommand } from '../data/slash-commands'
import type { AgentMode } from '../utils/constants'
import type { LocalAgentInfo } from '../utils/local-agent-registry'
import type {
  MatchedAgentInfo,
  MatchedFileInfo,
  MatchedSlashCommand,
} from '../utils/suggestion-filtering'
import type { TriggerContext } from '../utils/suggestion-parsing'
import type { FileTreeNode } from '@codebuff/common/util/file'

// Re-export types for consumers
export type { MatchedAgentInfo, MatchedFileInfo, MatchedSlashCommand }
export type { TriggerContext }
export { isInsideStringDelimiters, parseAtInLine } from '../utils/suggestion-parsing'

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
  currentAgentMode?: AgentMode
}

export const useSuggestionEngine = ({
  inputValue,
  cursorPosition,
  slashCommands,
  localAgents,
  fileTree,
  disableAgentSuggestions = false,
  currentAgentMode,
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

  // Note: mentionContext uses inputValue directly (not deferredInput) because
  // the cursor position must match the text being parsed. Using deferredInput
  // with current cursorPosition causes desync during heavy renders, making the
  // @ menu fail to appear intermittently (especially after long conversations).
  const mentionContext = useMemo(
    () => parseMentionContext(inputValue, cursorPosition),
    [inputValue, cursorPosition],
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
    return slashMatches.map((command) => {
      // Check if this is a mode command and if it's the current mode
      const modeMatch = command.id.match(/^mode:(default|max|plan)$/i)
      const isCurrentMode =
        modeMatch && currentAgentMode?.toLowerCase() === modeMatch[1]

      return {
        id: command.id,
        label: command.label,
        labelHighlightIndices: command.labelHighlightIndices,
        description: isCurrentMode
          ? `${command.description} (current)`
          : command.description,
        descriptionHighlightIndices: command.descriptionHighlightIndices,
      }
    })
  }, [slashMatches, currentAgentMode])

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
