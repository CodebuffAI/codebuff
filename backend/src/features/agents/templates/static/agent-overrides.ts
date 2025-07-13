import path from 'path'

import { Model } from '@codebuff/common/constants'
import {
  AgentOverrideConfig,
  ArrayOverride,
  PromptOverride,
} from '@codebuff/common/types/agent-overrides'
import { AgentTemplateType } from '@codebuff/common/types/session-state'
import {
  normalizeAgentName,
  normalizeAgentNames,
} from '@codebuff/common/util/agent-name-normalization'
import { validateAgentTemplateConfigs } from '@codebuff/common/util/agent-template-validation'
import { ProjectFileContext } from '@codebuff/common/util/file'

import { logger } from '../../../../util/logger'
import { AgentTemplate } from './types'

/**
 * Processes agent template overrides from .agents/templates files
 */
export function processAgentOverrides(
  baseTemplate: AgentTemplate,
  fileContext: ProjectFileContext
): AgentTemplate {
  const { overrideFiles, validationErrors } = findOverrideFiles(
    baseTemplate.id,
    fileContext
  )

  // Send validation errors to client if any
  // if (validationErrors.length > 0 && ws && userInputId) {
  //   const errorMessage = formatValidationErrorMessage(validationErrors)
  //   sendAction(ws, {
  //     type: 'response-chunk',
  //     userInputId,
  //     chunk: `\n\n**Agent Template Validation Errors:**\n${errorMessage}\n\n`
  //   })
  // }

  if (overrideFiles.length === 0) {
    return baseTemplate
  }

  try {
    // Apply overrides in order (later files override earlier ones)
    return overrideFiles.reduce(
      (template, overrideFile) =>
        applyOverride(template, overrideFile, fileContext),
      { ...baseTemplate }
    )
  } catch (error) {
    logger.error(
      { error, agentType: baseTemplate.id },
      'Error processing agent overrides, using base template'
    )
    return baseTemplate
  }
}

/**
 * Find override files that match the agent type
 */
function findOverrideFiles(
  agentType: AgentTemplateType,
  fileContext: ProjectFileContext
): {
  overrideFiles: Array<{ path: string; config: AgentOverrideConfig }>
  validationErrors: Array<{ filePath: string; message: string }>
} {
  const { agentTemplates } = fileContext
  if (!agentTemplates) return { overrideFiles: [], validationErrors: [] }

  const { validConfigs, validationErrors } = validateAgentTemplateConfigs(
    agentTemplates,
    []
  )

  // Filter valid configs for the specific agent type and only override configs
  const overrideFiles = validConfigs
    .filter(({ config }) => 'override' in config && config.override === true)
    .filter(({ config }) =>
      shouldApplyOverride(config as AgentOverrideConfig, agentType)
    )
    .map(({ filePath, config }) => ({
      path: filePath,
      config: config as AgentOverrideConfig,
    }))

  return { overrideFiles, validationErrors }
}

/**
 * Check if an override should apply to the given agent type
 */
function shouldApplyOverride(
  config: AgentOverrideConfig,
  agentType: AgentTemplateType
): boolean {
  const { id } = config

  // Normalize both the target type and agent type to handle CodebuffAI/ prefixes
  const normalizedTargetType = normalizeAgentName(id)
  const normalizedAgentType = normalizeAgentName(agentType)
  return normalizedTargetType === normalizedAgentType
}

/**
 * Apply a single override to a template
 */
function applyOverride(
  template: AgentTemplate,
  overrideFile: { path: string; config: AgentOverrideConfig },
  fileContext: ProjectFileContext
): AgentTemplate {
  const override = overrideFile.config
  const result = { ...template }

  // Apply overrides directly
  if (override.model) {
    result.model = override.model as Model
  }

  if (override.systemPrompt) {
    result.systemPrompt = applyPromptOverride(
      result.systemPrompt,
      override.systemPrompt,
      fileContext,
      overrideFile.path
    )
  }

  if (override.userInputPrompt) {
    result.userInputPrompt = applyPromptOverride(
      result.userInputPrompt,
      override.userInputPrompt,
      fileContext,
      overrideFile.path
    )
  }

  if (override.agentStepPrompt) {
    result.agentStepPrompt = applyPromptOverride(
      result.agentStepPrompt,
      override.agentStepPrompt,
      fileContext,
      overrideFile.path
    )
  }

  if (override.spawnableAgents) {
    const rawSpawnableAgents = applyArrayOverride(
      result.spawnableAgents,
      override.spawnableAgents
    ) as string[]
    // Normalize agent names to remove CodebuffAI/ prefix
    result.spawnableAgents = normalizeAgentNames(
      rawSpawnableAgents
    ) as AgentTemplateType[]
  }

  if (override.toolNames) {
    result.toolNames = applyArrayOverride(
      result.toolNames,
      override.toolNames
    ) as any[]
  }

  return result
}

/**
 * Apply prompt override (append, prepend, or replace)
 */
function applyPromptOverride(
  basePrompt: string | undefined,
  override: PromptOverride,
  fileContext: ProjectFileContext,
  overrideFilePath: string
): string {
  let overrideContent = ''

  // Get content from external file or inline content
  if (override.path) {
    const overrideDir = path.posix.dirname(overrideFilePath)
    const externalFilePath = path.posix.join(overrideDir, override.path)
    overrideContent = fileContext.agentTemplates?.[externalFilePath] || ''
  } else if (override.content) {
    overrideContent = override.content
  }

  // Apply the override based on type
  switch (override.type) {
    case 'append':
      return (basePrompt || '') + '\n\n' + overrideContent
    case 'prepend':
      return overrideContent + '\n\n' + (basePrompt || '')
    case 'replace':
      return overrideContent
    default:
      return basePrompt || ''
  }
}

/**
 * Apply array override (append or replace)
 */
function applyArrayOverride<T>(baseArray: T[], override: ArrayOverride): T[] {
  const overrideItems = Array.isArray(override.content)
    ? override.content
    : [override.content]

  return override.type === 'append'
    ? [...baseArray, ...(overrideItems as T[])]
    : (overrideItems as T[])
}
