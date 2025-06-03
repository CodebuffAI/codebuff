import { existsSync, readFileSync } from 'fs'
import path from 'path'

import { parse as parseJsonc } from 'jsonc-parser'
import { yellow } from 'picocolors'

import {
  CodebuffConfig,
  codebuffConfigFile,
  codebuffConfigFileBackup,
  CodebuffConfigSchema,
} from 'common/json-config/constants'
import { getProjectRoot } from '../project-files'

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
