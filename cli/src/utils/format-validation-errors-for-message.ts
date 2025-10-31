import path from 'path'

import { formatValidationError } from './validation-error-formatting'

import type { LocalAgentInfo } from './local-agent-registry'

export type ValidationErrorForMessage = {
  id: string
  message: string
}

export interface FormatValidationErrorsOptions {
  errors: ValidationErrorForMessage[]
  loadedAgentsData?: {
    agents: Array<{ id: string; displayName: string; filePath?: string }>
    agentsDir: string
  } | null
}

export interface FormattedValidationErrors {
  text: string
  filePathByAgentId: Map<string, string>
}

/**
 * Formats validation errors for display in chat messages.
 * Matches the formatting from the validation banner.
 * Returns formatted text and a map of agent IDs to file paths for creating clickable links.
 */
export function formatValidationErrorsForMessage(
  options: FormatValidationErrorsOptions,
): FormattedValidationErrors {
  const { errors, loadedAgentsData } = options

  const filePathByAgentId = new Map<string, string>()

  // Helper to normalize relative path (matching banner format)
  const normalizeRelativePath = (filePath: string): string => {
    if (!loadedAgentsData) return filePath
    const relativeToAgentsDir = path.relative(
      loadedAgentsData.agentsDir,
      filePath,
    )
    const normalized = relativeToAgentsDir.replace(/\\/g, '/')
    return `.agents/${normalized}`
  }

  // Get agent info by ID
  const agentInfoById = new Map<string, LocalAgentInfo>(
    (loadedAgentsData?.agents.map((agent) => [
      agent.id,
      agent as LocalAgentInfo,
    ]) || []) as [string, LocalAgentInfo][],
  )

  const text = errors
    .map((error, index) => {
      const agentId = error.id.replace(/_\d+$/, '')
      const agentInfo = agentInfoById.get(agentId)
      const relativePath = agentInfo?.filePath
        ? normalizeRelativePath(agentInfo.filePath)
        : null

      // Store file path for this agent ID to enable clickable links
      if (agentInfo?.filePath) {
        filePathByAgentId.set(agentId, agentInfo.filePath)
      }

      const { fieldName, message } = formatValidationError(error.message)
      const errorMsg = fieldName ? `${fieldName}: ${message}` : message
      const truncatedMsg = errorMsg.length > 68 ? errorMsg.substring(0, 65) + '...' : errorMsg

      let output = index === 0 ? '' : '\n\n'
      output += agentId
      if (relativePath) {
        output += ` (${relativePath})`
      }
      output += '\n  ' + truncatedMsg
      return output
    })
    .join('')

  return { text, filePathByAgentId }
}
