import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  SKILLS_DIR_NAME,
  SKILL_FILE_NAME,
  isValidSkillName,
} from '@codebuff/common/constants/skills'
import {
  SkillFrontmatterSchema,
  type SkillDefinition,
  type SkillsMap,
} from '@codebuff/common/types/skill'
import matter from 'gray-matter'

// Re-export from common for backward compatibility
export { formatAvailableSkillsXml } from '@codebuff/common/util/skills'

/**
 * Parses YAML frontmatter from a SKILL.md file using gray-matter.
 * Frontmatter is expected to be between --- markers at the start of the file.
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>
  body: string
} | null {
  try {
    const parsed = matter(content)
    if (!parsed.data || Object.keys(parsed.data).length === 0) {
      return null
    }
    return {
      frontmatter: parsed.data as Record<string, unknown>,
      body: parsed.content,
    }
  } catch {
    return null
  }
}

/**
 * Loads a single skill from a SKILL.md file.
 * Returns null if the skill is invalid.
 */
function loadSkillFromFile(
  skillDir: string,
  skillFilePath: string,
  verbose: boolean,
): SkillDefinition | null {
  const dirName = path.basename(skillDir)

  // Read the file
  let content: string
  try {
    content = fs.readFileSync(skillFilePath, 'utf8')
  } catch {
    if (verbose) {
      console.error(`Failed to read skill file: ${skillFilePath}`)
    }
    return null
  }

  // Parse frontmatter
  const parsed = parseFrontmatter(content)
  if (!parsed) {
    if (verbose) {
      console.error(`Invalid frontmatter in skill file: ${skillFilePath}`)
    }
    return null
  }

  // Validate frontmatter
  const result = SkillFrontmatterSchema.safeParse(parsed.frontmatter)
  if (!result.success) {
    if (verbose) {
      console.error(
        `Invalid skill frontmatter in ${skillFilePath}: ${result.error.message}`,
      )
    }
    return null
  }

  const frontmatter = result.data

  // Verify name matches directory name
  if (frontmatter.name !== dirName) {
    if (verbose) {
      console.error(
        `Skill name '${frontmatter.name}' does not match directory name '${dirName}' in ${skillFilePath}`,
      )
    }
    return null
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    license: frontmatter.license,
    metadata: frontmatter.metadata,
    content,
    filePath: skillFilePath,
  }
}

/**
 * Discovers skills from a skills directory.
 * Looks for <skillsDir>/<skill-name>/SKILL.md files.
 */
function discoverSkillsFromDirectory(
  skillsDir: string,
  verbose: boolean,
): SkillsMap {
  const skills: SkillsMap = {}

  let entries: string[]
  try {
    entries = fs.readdirSync(skillsDir)
  } catch {
    return skills
  }

  for (const entry of entries) {
    const skillDir = path.join(skillsDir, entry)

    // Skip non-directories and invalid skill names
    try {
      const stat = fs.statSync(skillDir)
      if (!stat.isDirectory()) continue
    } catch {
      continue
    }

    if (!isValidSkillName(entry)) {
      if (verbose) {
        console.warn(`Skipping invalid skill directory name: ${entry}`)
      }
      continue
    }

    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)

    // Check if SKILL.md exists
    try {
      fs.statSync(skillFilePath)
    } catch {
      continue
    }

    const skill = loadSkillFromFile(skillDir, skillFilePath, verbose)
    if (skill) {
      skills[skill.name] = skill
    }
  }

  return skills
}

/**
 * Gets the default skills directories to search.
 * Searches both .claude/skills and .agents/skills for Claude Code compatibility.
 * 
 * Order (later overrides earlier):
 * - ~/.claude/skills/ (global Claude-compatible)
 * - ~/.agents/skills/ (global Codebuff)
 * - {cwd}/.claude/skills/ (project Claude-compatible)
 * - {cwd}/.agents/skills/ (project Codebuff)
 */
function getDefaultSkillsDirs(cwd: string): string[] {
  const home = os.homedir()
  return [
    // Global directories (Claude-compatible first, then Codebuff)
    path.join(home, '.claude', SKILLS_DIR_NAME),
    path.join(home, '.agents', SKILLS_DIR_NAME),
    // Project directories (Claude-compatible first, then Codebuff)
    path.join(cwd, '.claude', SKILLS_DIR_NAME),
    path.join(cwd, '.agents', SKILLS_DIR_NAME),
  ]
}

export type LoadSkillsOptions = {
  /** Working directory for project skills. Defaults to process.cwd() */
  cwd?: string
  /** Optional specific skills directory path */
  skillsPath?: string
  /** Whether to log errors during loading */
  verbose?: boolean
}

/**
 * Load skills from .agents/skills and .claude/skills directories.
 *
 * By default, searches for skills in (later overrides earlier):
 * - `~/.claude/skills/` (global, Claude Code compatible)
 * - `~/.agents/skills/` (global)
 * - `{cwd}/.claude/skills/` (project, Claude Code compatible)
 * - `{cwd}/.agents/skills/` (project, highest priority)
 *
 * Each skill must be in its own directory with a SKILL.md file:
 * - `.agents/skills/my-skill/SKILL.md`
 * - `.claude/skills/my-skill/SKILL.md`
 *
 * @param options.cwd - Working directory for project skills
 * @param options.skillsPath - Optional path to a specific skills directory
 * @param options.verbose - Whether to log errors during loading
 * @returns Record of skill definitions keyed by skill name
 *
 * @example
 * ```typescript
 * // Load from default locations
 * const skills = await loadSkills({ verbose: true })
 *
 * // Load from a specific directory
 * const skills = await loadSkills({ skillsPath: './my-skills' })
 *
 * // Access a skill
 * const gitReleaseSkill = skills['git-release']
 * console.log(gitReleaseSkill.description)
 * ```
 */
export async function loadSkills(options: LoadSkillsOptions = {}): Promise<SkillsMap> {
  const { cwd = process.cwd(), skillsPath, verbose = false } = options

  const skills: SkillsMap = {}

  const skillsDirs = skillsPath ? [skillsPath] : getDefaultSkillsDirs(cwd)

  for (const skillsDir of skillsDirs) {
    const dirSkills = discoverSkillsFromDirectory(skillsDir, verbose)
    // Later directories override earlier ones (project overrides global)
    Object.assign(skills, dirSkills)
  }

  return skills
}


