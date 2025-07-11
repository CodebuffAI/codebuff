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
    throw new Error(`Failed to load content from path: ${filePath}`)
  }
}

/**
 * Resolves a prompt field that can be either a string or a path reference.
 * Used by dynamic agent templates.
 *
 * @param field - Either a string or an object with a path property
 * @param basePaths - The base paths to try to resolve the path against
 * @returns The resolved content as a string
 */
export function resolvePromptField(
  field: string | { path: string },
  basePaths: string[]
): string {
  if (typeof field === 'string') {
    return field
  }

  if (field.path) {
    let error: Error | undefined = undefined
    for (const basePath of basePaths) {
      try {
        return resolveFileContent(field.path, basePath)
      } catch (e) {
        error = e as Error
      }
    }
    logger.warn(
      { path: field.path, basePaths, error },
      `Failed to load content from file path ${field.path}`
    )
    throw new Error(`Failed to load content from path: ${field.path}`)
  }

  throw new Error('Invalid prompt field format')
}
