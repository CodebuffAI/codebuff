import fs from 'fs'
import path from 'path'

const KNOWLEDGE_DIR = '.agents/knowledge'

export function knowledgeDir(projectRoot: string): string {
  return path.join(projectRoot, KNOWLEDGE_DIR)
}

export function ensureKnowledgeDir(projectRoot: string): void {
  const dir = knowledgeDir(projectRoot)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function readKnowledgeFiles(
  projectRoot: string,
): Record<string, string> {
  const dir = knowledgeDir(projectRoot)
  if (!fs.existsSync(dir)) return {}

  const files: Record<string, string> = {}
  try {
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const filePath = path.join(dir, entry)
      try {
        files[path.join(KNOWLEDGE_DIR, entry)] = fs.readFileSync(
          filePath,
          'utf8',
        )
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // directory doesn't exist or can't be read
  }

  return files
}

export const KNOWLEDGE_FILE_NAMES = [
  'architecture.md',
  'tech-stack.md',
  'conventions.md',
  'testing.md',
] as const
