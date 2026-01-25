import { z } from 'zod/v4'

import {
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_REGEX,
  SKILL_DESCRIPTION_MAX_LENGTH,
} from '../constants/skills'

/**
 * Zod schema for skill frontmatter metadata.
 */
export const SkillMetadataSchema = z.record(z.string(), z.string())

/**
 * Zod schema for skill frontmatter (parsed from YAML).
 */
export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(SKILL_NAME_MAX_LENGTH)
    .regex(
      SKILL_NAME_REGEX,
      'Name must be lowercase alphanumeric with single hyphen separators',
    ),
  description: z.string().min(1).max(SKILL_DESCRIPTION_MAX_LENGTH),
  license: z.string().optional(),
  metadata: SkillMetadataSchema.optional(),
})

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>

/**
 * Full skill definition including content and source path.
 */
export const SkillDefinitionSchema = z.object({
  /** Skill name (must match directory name) */
  name: z.string(),
  /** Short description for agent discovery */
  description: z.string(),
  /** Optional license */
  license: z.string().optional(),
  /** Optional key-value metadata */
  metadata: SkillMetadataSchema.optional(),
  /** Full SKILL.md content (including frontmatter) */
  content: z.string(),
  /** Source file path */
  filePath: z.string(),
})

export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>

/**
 * Collection of skills keyed by skill name.
 */
export type SkillsMap = Record<string, SkillDefinition>
