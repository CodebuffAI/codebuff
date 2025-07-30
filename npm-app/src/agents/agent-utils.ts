import * as fs from 'fs'
import * as path from 'path'
import { PromptField } from '@codebuff/common/types/dynamic-agent-template'
import { getProjectRoot } from '../project-files'

const agentTemplatesSubdir = ['.agents'] as const

/**
 * Get all TypeScript files recursively from a directory
 */
export function getAllTsFiles(dir: string): string[] {
  const files: string[] = []

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        files.push(...getAllTsFiles(fullPath))
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(fullPath)
      }
    }
  } catch (error) {
    // Ignore errors reading directories
  }

  return files
}

/**
 * Load file contents for prompt fields
 */
export function loadFileContents(promptField: PromptField | undefined): string {
  if (promptField === undefined) {
    return ''
  }

  if (typeof promptField === 'string') {
    return promptField
  }

  const originalPath = promptField.path
  const projectRoot = getProjectRoot()

  // Try multiple path variations for better compatibility
  const pathVariations = [
    path.join(projectRoot, originalPath),
    path.join(projectRoot, ...agentTemplatesSubdir, originalPath),
    path.join(
      projectRoot,
      ...agentTemplatesSubdir,
      path.basename(originalPath)
    ),
  ]

  for (const filePath of pathVariations) {
    try {
      return fs.readFileSync(filePath, 'utf8')
    } catch (error) {
      // Ignore errors and try the next path variation
    }
  }

  return ''
}

/**
 * Get the agents directory path
 */
export function getAgentsDirectory(): string {
  return path.join(getProjectRoot(), ...agentTemplatesSubdir)
}
