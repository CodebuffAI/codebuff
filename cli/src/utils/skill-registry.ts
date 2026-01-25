import { loadSkills as sdkLoadSkills } from '@codebuff/sdk'

import { getProjectRoot } from '../project-files'
import { logger } from './logger'

import type { SkillDefinition, SkillsMap } from '@codebuff/common/types/skill'

// ============================================================================
// Skills cache (loaded via SDK at startup)
// ============================================================================

let skillsCache: SkillsMap = {}

/**
 * Initialize the skill registry by loading skills via the SDK.
 * This must be called at CLI startup.
 * 
 * Skills are loaded from:
 * - ~/.agents/skills/ (global)
 * - {projectRoot}/.agents/skills/ (project, overrides global)
 */
export async function initializeSkillRegistry(): Promise<void> {
  const cwd = getProjectRoot() || process.cwd()

  try {
    // Load skills from both global (~/.agents/skills) and project directories
    // The SDK handles merging, with project skills overriding global ones
    skillsCache = await sdkLoadSkills({
      cwd,
      verbose: false,
    })
  } catch (error) {
    logger.warn({ error }, 'Failed to load skills')
    skillsCache = {}
  }
}

// ============================================================================
// Skills access
// ============================================================================

/**
 * Get all loaded skills.
 */
export function getLoadedSkills(): SkillsMap {
  return skillsCache
}

/**
 * Get a skill by name.
 */
export function getSkillByName(name: string): SkillDefinition | undefined {
  return skillsCache[name]
}

/**
 * Get the number of loaded skills.
 */
export function getSkillCount(): number {
  return Object.keys(skillsCache).length
}

// ============================================================================
// UI/Display utilities
// ============================================================================

/**
 * Get a message describing loaded skills for display.
 */
export function getLoadedSkillsMessage(): string | null {
  const skills = Object.values(skillsCache)

  if (skills.length === 0) {
    return null
  }

  const header = `Loaded ${skills.length} skill${skills.length === 1 ? '' : 's'}`
  const skillList = skills
    .map((skill) => `  - ${skill.name}: ${skill.description.slice(0, 60)}${skill.description.length > 60 ? '...' : ''}`)
    .join('\n')

  return `${header}\n${skillList}`
}

// ============================================================================
// Testing utilities
// ============================================================================

/**
 * Clear cached skills. Intended for test scenarios.
 */
export function __resetSkillRegistryForTests(): void {
  skillsCache = {}
}
