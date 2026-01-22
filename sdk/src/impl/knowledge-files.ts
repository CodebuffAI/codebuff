/**
 * Knowledge file discovery and selection utilities.
 */

import * as os from 'os'
import path from 'path'

import {
  KNOWLEDGE_FILE_NAMES_LOWERCASE,
  isKnowledgeFile,
} from '@codebuff/common/constants/knowledge'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

/**
 * Given a list of candidate file paths, selects the one with highest priority.
 * Priority order: knowledge.md > AGENTS.md > CLAUDE.md (case-insensitive).
 * @internal Exported for testing
 */
export function selectHighestPriorityKnowledgeFile(
  candidates: string[],
): string | undefined {
  for (const priorityName of KNOWLEDGE_FILE_NAMES_LOWERCASE) {
    const match = candidates.find(
      (f) => path.basename(f).toLowerCase() === priorityName,
    )
    if (match) return match
  }
  return undefined
}

/**
 * Loads a user knowledge file from the home directory.
 * Checks for ~/.knowledge.md, ~/.AGENTS.md, and ~/.CLAUDE.md with priority fallback.
 * Only loads the highest priority file found.
 * @internal Exported for testing
 */
export async function loadUserKnowledgeFile(params: {
  fs: CodebuffFileSystem
  logger: Logger
  homeDir?: string
}): Promise<Record<string, string>> {
  const { fs, logger } = params
  const homeDir = params.homeDir ?? os.homedir()
  const userKnowledgeFiles: Record<string, string> = {}

  let entries: string[]
  try {
    entries = await fs.readdir(homeDir)
  } catch {
    logger.debug?.({ homeDir }, 'Failed to read home directory')
    return userKnowledgeFiles
  }

  const candidates = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.startsWith('.')) continue
    const nameWithoutDot = entry.slice(1)
    const lowerName = nameWithoutDot.toLowerCase()
    if (KNOWLEDGE_FILE_NAMES_LOWERCASE.includes(lowerName)) {
      candidates.set(lowerName, entry)
    }
  }

  for (const priorityName of KNOWLEDGE_FILE_NAMES_LOWERCASE) {
    const actualFileName = candidates.get(priorityName)
    if (actualFileName) {
      const filePath = path.join(homeDir, actualFileName)
      try {
        const content = await fs.readFile(filePath, 'utf8')
        const tildeKey = `~/${actualFileName}`
        userKnowledgeFiles[tildeKey] = content
        break
      } catch {
        logger.debug?.({ filePath }, 'Failed to read user knowledge file')
      }
    }
  }

  return userKnowledgeFiles
}

/**
 * Selects knowledge files from a list of file paths with fallback logic.
 * For standard files (knowledge.md, AGENTS.md, CLAUDE.md), selects one per directory by priority.
 * For *.knowledge.md pattern files, includes ALL of them.
 * @internal Exported for testing
 */
export function selectKnowledgeFilePaths(allFilePaths: string[]): string[] {
  // Separate standard files from *.knowledge.md pattern files in a single pass
  const standardFiles: string[] = []
  const patternFiles: string[] = []

  for (const filePath of allFilePaths) {
    if (!isKnowledgeFile(filePath)) continue

    const basename = path.basename(filePath).toLowerCase()
    if (KNOWLEDGE_FILE_NAMES_LOWERCASE.includes(basename)) {
      standardFiles.push(filePath)
    } else if (basename.endsWith('.knowledge.md')) {
      patternFiles.push(filePath)
    }
  }

  // Group standard files by directory and select one per directory (highest priority)
  const byDirectory = new Map<string, string[]>()
  for (const filePath of standardFiles) {
    const dir = path.dirname(filePath)
    const files = byDirectory.get(dir) ?? []
    files.push(filePath)
    byDirectory.set(dir, files)
  }

  const selectedStandard: string[] = []
  for (const files of byDirectory.values()) {
    const selected = selectHighestPriorityKnowledgeFile(files)
    if (selected) {
      selectedStandard.push(selected)
    }
  }

  // Return both standard files (one per dir) + ALL pattern files
  return [...selectedStandard, ...patternFiles]
}

/**
 * Auto-derives knowledge files from project files if knowledgeFiles is undefined.
 * Implements fallback priority: knowledge.md > AGENTS.md > CLAUDE.md per directory.
 */
export function deriveKnowledgeFiles(
  projectFiles: Record<string, string>,
): Record<string, string> {
  const allFilePaths = Object.keys(projectFiles)
  const selectedFilePaths = selectKnowledgeFilePaths(allFilePaths)

  const knowledgeFiles: Record<string, string> = {}
  for (const filePath of selectedFilePaths) {
    knowledgeFiles[filePath] = projectFiles[filePath]
  }
  return knowledgeFiles
}
