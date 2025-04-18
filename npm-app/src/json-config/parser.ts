import fs from 'fs'
import path from 'path'

import { yellow } from 'picocolors'

import { CodebuffConfig, CodebuffConfigSchema } from './constants'

/**
 * Loads and validates the codebuff.json configuration file from the project directory.
 * @param projectPath - The root directory of the project
 * @returns The parsed and validated configuration, or null if no valid config exists
 */
export function loadCodebuffConfig(projectPath: string): CodebuffConfig | null {
  const configPath = path.join(projectPath, 'codebuff.json')

  if (!fs.existsSync(configPath)) {
    return null
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8')
    const parsedConfig = JSON.parse(configContent)

    const result = CodebuffConfigSchema.safeParse(parsedConfig)

    if (!result.success) {
      console.warn(
        yellow(
          'Warning: Invalid codebuff.json configuration. Please check the schema:\n' +
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
          'Warning: Invalid JSON in codebuff.json. Please check the syntax.'
        )
      )
    } else {
      console.warn(
        yellow('Warning: Error reading codebuff.json configuration file.')
      )
    }
    return null
  }
}
