import { jsonToolResult } from '@codebuff/common/util/messages'
import { SKILLS_DIR_NAME, SKILL_FILE_NAME } from '@codebuff/common/constants/skills'
import { SkillFrontmatterSchema, type SkillDefinition } from '@codebuff/common/types/skill'
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
 * Dynamically load a single skill from disk.
 * Used when a skill is not found in the pre-loaded cache but may have been created during the session.
 */
async function loadSkillFromDisk(
  projectRoot: string,
  skillName: string,
): Promise<SkillDefinition | null> {
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
    } catch {
      // Skill doesn't exist in this directory, try the next one
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

  const result: { name: string; description: string; content: string; license?: string } = {
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
