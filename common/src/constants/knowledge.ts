import path from 'path'

/**
 * The primary/default knowledge file name.
 * Used when creating new knowledge files.
 */
export const PRIMARY_KNOWLEDGE_FILE_NAME = 'knowledge.md'

/**
 * Knowledge file names in priority order (highest priority first).
 * Used for both project knowledge files and home directory user knowledge files.
 */
export const KNOWLEDGE_FILE_NAMES = [
  PRIMARY_KNOWLEDGE_FILE_NAME,
  'AGENTS.md',
  'CLAUDE.md',
] as const

/**
 * Pre-computed lowercase knowledge file names for efficient matching.
 */
export const KNOWLEDGE_FILE_NAMES_LOWERCASE = KNOWLEDGE_FILE_NAMES.map((name) =>
  name.toLowerCase(),
)

/**
 * Checks if a file path is a knowledge file.
 * Matches:
 * - Exact file names: knowledge.md, AGENTS.md, CLAUDE.md (case-insensitive)
 * - Pattern: *.knowledge.md (e.g., authentication.knowledge.md)
 */
export function isKnowledgeFile(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase()

  // Check for exact matches with standard knowledge file names
  if (KNOWLEDGE_FILE_NAMES_LOWERCASE.includes(fileName)) {
    return true
  }

  // Check for *.knowledge.md pattern (e.g., authentication.knowledge.md)
  if (fileName.endsWith('.knowledge.md')) {
    return true
  }

  return false
}
