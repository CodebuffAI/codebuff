import * as fs from 'fs'
import * as path from 'path'
import { logger } from './logger'

/**
 * Resolves content from a file path, with support for both absolute and relative paths.
 * 
 * @param filePath - The file path to resolve (absolute or relative)
 * @param basePath - The base path to resolve relative paths against
 * @returns The file content as a string, trimmed
 * @throws Error if the file cannot be read
 */
export function resolveFileContent(filePath: string, basePath: string): string {
  try {
    // Resolve path relative to base path
    const resolvedPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.resolve(basePath, filePath)
    
    const content = fs.readFileSync(resolvedPath, 'utf-8')
    return content.trim()
  } catch (error) {
    logger.warn({ path: filePath, basePath, error }, 'Failed to load content from file path')
    throw new Error(`Failed to load content from path: ${filePath}`)
  }
}

/**
 * Resolves a prompt field that can be either a string or a path reference.
 * Used by dynamic agent templates.
 * 
 * @param field - Either a string or an object with a path property
 * @param basePath - The base path to resolve relative paths against
 * @returns The resolved content as a string
 */
export function resolvePromptField(
  field: string | { path: string },
  basePath: string
): string {
  if (typeof field === 'string') {
    return field
  }

  if (field.path) {
    return resolveFileContent(field.path, basePath)
  }

  throw new Error('Invalid prompt field format')
}
