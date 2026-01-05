import { readdirSync, statSync } from 'fs'
import path from 'path'

export type DirectoryEntry = {
  name: string
  path: string
  isParent: boolean
  isGitRepo: boolean
}

/**
 * Get directory entries for a given path, including parent directory option.
 * Skips hidden directories (those starting with '.').
 */
export function getDirectories(dirPath: string): DirectoryEntry[] {
  const entries: DirectoryEntry[] = []

  // Add parent directory option if not at filesystem root
  const parentDir = path.dirname(dirPath)
  if (parentDir !== dirPath) {
    entries.push({
      name: '..',
      path: parentDir,
      isParent: true,
      isGitRepo: false,
    })
  }

  try {
    const items = readdirSync(dirPath)
    for (const item of items) {
      // Skip hidden directories
      if (item.startsWith('.')) continue

      const fullPath = path.join(dirPath, item)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          entries.push({
            name: item,
            path: fullPath,
            isParent: false,
            isGitRepo: hasGitDirectory(fullPath),
          })
        }
      } catch {
        // Skip items we can't stat
      }
    }
  } catch {
    // If we can't read the directory, just return parent option
  }

  // Sort non-parent entries alphabetically (case-insensitive)
  const parentEntry = entries.find((e) => e.isParent)
  const childEntries = entries.filter((e) => !e.isParent)
  childEntries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

  return parentEntry ? [parentEntry, ...childEntries] : childEntries
}

/**
 * Check if a directory contains a .git subdirectory.
 */
export function hasGitDirectory(dirPath: string): boolean {
  try {
    const gitPath = path.join(dirPath, '.git')
    return statSync(gitPath).isDirectory()
  } catch {
    return false
  }
}
