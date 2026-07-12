import { jsonToolResult } from '@codebuff/common/util/messages'
import {
  SKILLS_DIR_NAME,
  SKILL_FILE_NAME,
} from '@codebuff/common/constants/skills'
import {
  SkillFrontmatterSchema,
  type SkillDefinition,
} from '@codebuff/common/types/skill'
import fs from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ProjectFileContext } from '@codebuff/common/util/file'

/**
 * Allow-list for skill directory names. Rejects path separators, `..`, and
 * any other character that could escape the skills directory via path.join.
 * Skill names are frontmatter `name` values / directory names, which are
 * short identifiers — no legitimate name needs characters outside this set.
 */
const SAFE_SKILL_NAME_RE = /^[A-Za-z0-9_.-]+$/

/**
 * Returns true if `skillName` is a safe single path component (no traversal).
 * Guards path.join(skillsDir, skillName) against `..` and absolute/separated input.
 */
function isSafeSkillName(skillName: string): boolean {
  return (
    typeof skillName === 'string' &&
    skillName.length > 0 &&
    skillName.length <= 64 &&
    skillName !== '.' &&
    skillName !== '..' &&
    !skillName.includes('/') &&
    !skillName.includes('\\') &&
    !path.isAbsolute(skillName) &&
    SAFE_SKILL_NAME_RE.test(skillName)
  )
}

/**
 * Dynamically load a single skill from disk.
 * Used when a skill is not found in the pre-loaded cache but may have been created during the session.
 */
async function loadSkillFromDisk(
  projectRoot: string,
  skillName: string,
): Promise<SkillDefinition | null> {
  // Reject unsafe skill names before path.join to prevent directory traversal.
  if (!isSafeSkillName(skillName)) {
    return null
  }
  const home = os.homedir()
  const skillsDirs = [
    // Global directories first
    path.join(home, '.agents', SKILLS_DIR_NAME),
    path.join(home, '.claude', SKILLS_DIR_NAME),
    // Project directories (later takes precedence for overwriting)
    path.join(projectRoot, '.agents', SKILLS_DIR_NAME),
    path.join(projectRoot, '.claude', SKILLS_DIR_NAME),
  ]

  for (const skillsDir of skillsDirs) {
    const skillDir = path.join(skillsDir, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)

    try {
      // Check if the skill directory and file exist
      const stat = fs.statSync(skillDir)
      if (!stat.isDirectory()) continue

      fs.statSync(skillFilePath) // Will throw if file doesn't exist

      // Read and parse the skill file
      const content = fs.readFileSync(skillFilePath, 'utf8')
      const parsed = matter(content)

      if (!parsed.data || Object.keys(parsed.data).length === 0) {
        continue
      }

      // Validate frontmatter
      const result = SkillFrontmatterSchema.safeParse(parsed.data)
      if (!result.success) {
        continue
      }

      const frontmatter = result.data

      // Verify name matches directory name
      if (frontmatter.name !== skillName) {
        continue
      }

      return {
        name: frontmatter.name,
        description: frontmatter.description,
        content,
        license: frontmatter.license,
        filePath: skillFilePath,
        metadata: frontmatter.metadata,
      }
    } catch (err) {
      // Skill doesn't exist / isn't readable in this directory, try the next
      // one. Surface the reason so a permissions or parse error doesn't look
      // identical to a missing directory.
      console.debug(
        `[skill] loadSkillFromDisk skipped ${skillName} in ${skillsDir}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      continue
    }
  }

  return null
}

type ToolName = 'skill'

export const handleSkill = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  fileContext: ProjectFileContext
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, fileContext } = params
  const { name } = toolCall.input

  await previousToolCallFinished

  const skills = fileContext.skills ?? {}
  const cachedSkill = skills[name]

  // If skill not in cache, try to load it dynamically from disk
  // This supports skills created during the session
  const diskSkill = cachedSkill
    ? null
    : fileContext.projectRoot
      ? await loadSkillFromDisk(fileContext.projectRoot, name)
      : null

  const skill = cachedSkill ?? diskSkill

  if (!skill) {
    const availableSkills = Object.keys(skills)
    const suggestion =
      availableSkills.length > 0
        ? ` Available skills: ${availableSkills.join(', ')}. You can also load skills created during this session by name.`
        : ' No skills are currently available. You can load skills created during this session by name.'

    return {
      output: jsonToolResult({
        name,
        description: '',
        content: `Error: Skill '${name}' not found.${suggestion}`,
      }),
    }
  }

  const result: {
    name: string
    description: string
    content: string
    license?: string
  } = {
    name: skill.name,
    description: skill.description,
    content: skill.content,
  }
  if (skill.license) {
    result.license = skill.license
  }

  return {
    output: jsonToolResult(result),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
