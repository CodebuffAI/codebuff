import { existsSync, statSync } from 'fs'
import path from 'path'

import { useCallback } from 'react'

import { getPathCompletion } from '../utils/path-completion'

export interface UsePathTabCompletionOptions {
  /** Current search query */
  searchQuery: string
  /** Set the search query */
  setSearchQuery: (query: string) => void
  /** Current directory path */
  currentPath: string
  /** Set the current directory path */
  setCurrentPath: (path: string) => void
  /** Function to expand ~ to home directory */
  expandPath: (inputPath: string) => string
}

export interface UsePathTabCompletionReturn {
  /** Handle tab completion, returns true to indicate key was handled */
  handleTabCompletion: () => boolean
}

/**
 * Hook for path tab completion.
 * Handles both absolute (/, ~) and relative path completion.
 * Always navigates to completed directories when completion ends with /.
 */
export function usePathTabCompletion({
  searchQuery,
  setSearchQuery,
  currentPath,
  setCurrentPath,
  expandPath,
}: UsePathTabCompletionOptions): UsePathTabCompletionReturn {
  const handleTabCompletion = useCallback((): boolean => {
    if (searchQuery.startsWith('/') || searchQuery.startsWith('~')) {
      // Absolute path completion
      const completed = getPathCompletion(searchQuery)
      if (completed) {
        // If completion is a full directory (ends with /), navigate there and keep the path in input
        if (completed.endsWith('/')) {
          const dirPath = expandPath(completed.slice(0, -1))
          try {
            if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
              setCurrentPath(dirPath)
              setSearchQuery(completed)
              return true
            }
          } catch {
            // Fall through to just set the query
          }
        }
        setSearchQuery(completed)
      }
    } else if (searchQuery.length > 0) {
      // Relative path completion - try from current directory
      const relativePath = path.join(currentPath, searchQuery)
      const completed = getPathCompletion(relativePath)
      if (completed) {
        // If completion is a full directory (ends with /), navigate there and keep the path in input
        if (completed.endsWith('/')) {
          try {
            const dirPath = completed.slice(0, -1)
            if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
              setCurrentPath(dirPath)
              setSearchQuery(completed)
              return true
            }
          } catch {
            // Fall through to just set the query
          }
        }
        // Convert back to relative path for display
        if (completed.startsWith(currentPath + path.sep)) {
          setSearchQuery(completed.slice(currentPath.length + 1))
        } else {
          setSearchQuery(completed)
        }
      }
    }
    return true
  }, [searchQuery, setSearchQuery, currentPath, setCurrentPath, expandPath])

  return { handleTabCompletion }
}
