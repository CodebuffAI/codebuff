import * as fs from 'fs'
import * as path from 'path'
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
 * Get the agents directory path
 */
export function getAgentsDirectory(): string {
  return path.join(getProjectRoot(), ...agentTemplatesSubdir)
}
