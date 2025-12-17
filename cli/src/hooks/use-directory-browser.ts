import { existsSync, statSync } from 'fs'
import os from 'os'
import path from 'path'

import { useCallback, useMemo, useState } from 'react'

import { getDirectories, hasGitDirectory } from '../utils/directory-browser'

import type { DirectoryEntry } from '../utils/directory-browser'

export interface UseDirectoryBrowserOptions {
  /** Initial path to browse from (defaults to home directory) */
  initialPath?: string
}

export interface UseDirectoryBrowserReturn {
  /** Current directory path */
  currentPath: string
  /** Set the current directory path */
  setCurrentPath: (path: string) => void
  /** List of directory entries in the current path */
  directories: DirectoryEntry[]
  /** Whether current directory is a git repository */
  isGitRepo: boolean
  /** Expand ~ to home directory */
  expandPath: (inputPath: string) => string
  /** Try to navigate to a typed path, returns true if successful */
  tryNavigateToPath: (inputPath: string) => boolean
  /** Navigate to a directory entry */
  navigateToDirectory: (entry: DirectoryEntry) => void
}

/**
 * Hook for directory browsing state and navigation.
 * Provides current path state, directory listing, git detection,
 * and navigation utilities.
 */
export function useDirectoryBrowser({
  initialPath,
}: UseDirectoryBrowserOptions = {}): UseDirectoryBrowserReturn {
  const [currentPath, setCurrentPath] = useState(initialPath ?? os.homedir())

  // Get directories for current path
  const directories = useMemo(() => getDirectories(currentPath), [currentPath])

  // Check if current directory has .git
  const isGitRepo = useMemo(() => hasGitDirectory(currentPath), [currentPath])

  // Expand ~ to home directory
  const expandPath = useCallback((inputPath: string): string => {
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1))
    }
    return inputPath
  }, [])

  // Try to navigate to a typed path
  const tryNavigateToPath = useCallback(
    (inputPath: string): boolean => {
      const expandedPath = expandPath(inputPath.trim())
      try {
        if (existsSync(expandedPath) && statSync(expandedPath).isDirectory()) {
          setCurrentPath(expandedPath)
          return true
        }
      } catch {
        // Path doesn't exist or can't be accessed
      }
      return false
    },
    [expandPath],
  )

  // Navigate to a directory entry
  const navigateToDirectory = useCallback((entry: DirectoryEntry) => {
    setCurrentPath(entry.path)
  }, [])

  return {
    currentPath,
    setCurrentPath,
    directories,
    isGitRepo,
    expandPath,
    tryNavigateToPath,
    navigateToDirectory,
  }
}
