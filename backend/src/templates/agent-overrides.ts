import path from 'path'

import { AGENT_TEMPLATES_DIR, Model } from '@codebuff/common/constants'
import {
  AgentOverrideConfig,
  AgentOverrideConfigSchema,
  PromptOverride,
  ArrayOverride,
} from '@codebuff/common/types/agent-overrides'
import { AgentTemplateType } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'

import { AgentTemplate } from './types'
import { logger } from '../util/logger'

/**
 * Processes agent template overrides from .agents/templates files
 */
export function processAgentOverrides(
  baseTemplate: AgentTemplate,
  fileContext: ProjectFileContext
): AgentTemplate {
  const overrideFiles = findOverrideFiles(baseTemplate.type, fileContext)
  if (overrideFiles.length === 0) {
    return baseTemplate
  }

  try {
    // Apply overrides in order (later files override earlier ones)
    return overrideFiles.reduce(
      (template, overrideFile) => applyOverride(template, overrideFile, fileContext),
      { ...baseTemplate }
    )
  } catch (error) {
    logger.error(
      { error, agentType: baseTemplate.type },
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
): Array<{ path: string; config: AgentOverrideConfig }> {
  const { agentTemplates } = fileContext
  if (!agentTemplates) return []

  const overrideFiles: Array<{ path: string; config: AgentOverrideConfig }> = []

  for (const [filePath, content] of Object.entries(agentTemplates)) {
    // Only process .json files in the agent templates directory
    if (
      !filePath.startsWith(AGENT_TEMPLATES_DIR) ||
      !filePath.endsWith('.json')
    ) {
      continue
    }

    try {
      const parsedContent = JSON.parse(content)
      const config = AgentOverrideConfigSchema.parse(parsedContent)

      if (shouldApplyOverride(config, agentType)) {
        overrideFiles.push({ path: filePath, config })
      }
    } catch (error) {
      // Skip invalid files - validation already done in npm-app
      continue
    }
  }

  return overrideFiles
}

/**
 * Check if an override should apply to the given agent type
 */
function shouldApplyOverride(
  config: AgentOverrideConfig,
  agentType: AgentTemplateType
): boolean {
  const { type } = config.override

  // Extract agent type from formats like "reviewer" or "CodebuffAI/reviewer"
  const targetAgentType = type.split('/').pop() || type
  return targetAgentType === agentType
}

/**
 * Apply a single override to a template
 */
function applyOverride(
  template: AgentTemplate,
  overrideFile: { path: string; config: AgentOverrideConfig },
  fileContext: ProjectFileContext
): AgentTemplate {
  const override = overrideFile.config.override
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
    result.spawnableAgents = applyArrayOverride(
      result.spawnableAgents,
      override.spawnableAgents
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
