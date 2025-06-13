import { existsSync, readFileSync } from 'fs'
import path from 'path'

import { yellow } from 'picocolors'

import {
  CodebuffConfig,
  codebuffConfigFile,
  codebuffConfigFileBackup,
  CodebuffConfigSchema,
} from '@codebuff/common/json-config/constants'
import { getProjectRoot } from '../project-files'

/**
 * Simple JSONC parser that strips comments and trailing commas
 * This is a lightweight alternative to jsonc-parser that works better with Bun's bundler
 */
function parseJsonc(text: string): any {
  // Simple state machine to track if we're inside a string
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
    } else {
      if (char === '"') {
        inString = true
        result += char
      } else if (char === '/' && nextChar === '/') {
        // Skip single-line comment
        while (i < text.length && text[i] !== '\n') {
          i++
        }
        if (i < text.length) result += text[i] // Add the newline
      } else if (char === '/' && nextChar === '*') {
        // Skip multi-line comment
        i += 2
        while (
          i < text.length - 1 &&
          !(text[i] === '*' && text[i + 1] === '/')
        ) {
          i++
        }
        i++ // Skip the closing '/'
      } else {
        result += char
      }
    }
  }

  // Remove trailing commas before closing brackets/braces
  result = result.replace(/,(\s*[}\]])/g, '$1')

  return JSON.parse(result)
}

/**
 * Loads and validates the configuration file from the project directory.
 * @param projectPath - The root directory of the project
 * @returns The parsed and validated configuration, or null if no valid config exists
 */
export function loadCodebuffConfig(): CodebuffConfig | null {
  const projectPath = getProjectRoot()
  const configPathPrimary = path.join(projectPath, codebuffConfigFile)
  const configPathBackup = path.join(projectPath, codebuffConfigFileBackup)
  const configPath = existsSync(configPathBackup)
    ? configPathBackup
    : existsSync(configPathPrimary)
      ? configPathPrimary
      : null

  if (configPath === null) {
    return null
  }

  try {
    const jsoncContent = readFileSync(configPath, 'utf-8')
    const parsedConfig = parseJsonc(jsoncContent)

    const result = CodebuffConfigSchema.safeParse(parsedConfig)

    if (!result.success) {
      console.warn(
        yellow(
          `Warning: Invalid ${codebuffConfigFile} configuration. Please check the schema:\n` +
            result.error.errors
              .map((err) => `- ${err.path.join('.')}: ${err.message}`)
              .join('\n')
        )
      )
      return null
    }

    return result.data
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(
        yellow(
          `Warning: Invalid JSON in ${codebuffConfigFile}. Please check the syntax.`
        )
      )
    } else {
      console.warn(
        yellow(
          `Warning: Error reading ${codebuffConfigFile} configuration file.`
        )
      )
    }
    return null
  }
}
