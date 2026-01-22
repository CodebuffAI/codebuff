import { getAllFilePaths } from '@codebuff/common/project-file-tree'

import { range } from './arrays'

import type { SuggestionItem } from '../components/suggestion-menu'
import type { SlashCommand } from '../data/slash-commands'
import type { Prettify } from '../types/utils'
import type { LocalAgentInfo } from './local-agent-registry'
import type { FileTreeNode } from '@codebuff/common/util/file'

export type MatchedSlashCommand = Prettify<
  SlashCommand &
    Pick<
      SuggestionItem,
      'descriptionHighlightIndices' | 'labelHighlightIndices'
    >
>

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

export const flattenFileTree = (nodes: FileTreeNode[]): string[] =>
  getAllFilePaths(nodes)

export const getFileName = (filePath: string): string => {
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

export const filterSlashCommands = (
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

export const filterAgentMatches = (
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
  // Prefix of ID or name
  for (const agent of agents) {
    const id = agent.id.toLowerCase()

    if (id.startsWith(normalized)) {
      pushUnique(matches, {
        ...agent,
        idHighlightIndices: createHighlightIndices(0, normalized.length),
      })
      continue
    }

    const name = agent.displayName.toLowerCase()
    if (name.startsWith(normalized)) {
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

export const filterFileMatches = (
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
