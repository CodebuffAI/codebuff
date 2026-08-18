import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  SKILLS_DIR_NAME,
  SKILL_FILE_NAME,
  isValidSkillName,
} from '@codebuff/common/constants/skills'
import {
  type SkillDefinition,
  type SkillsMap,
} from '@codebuff/common/types/skill'
import { parseSkillFileContent } from '@codebuff/common/util/parse-skill'

// Re-export from common for backward compatibility
export { formatAvailableSkillsXml } from '@codebuff/common/util/skills'

// `parseSkillFileContent` MOVED to common and is re-exported here, so this
// stays the one implementation rather than becoming two. It left because
// importing it via this barrel drags tree-sitter along, which cannot resolve
// its `.wasm` inside a Convex action — see the note on the function itself.
export { parseSkillFileContent } from '@codebuff/common/util/parse-skill'

function loadSkillFromFile(
  skillDir: string,
  skillFilePath: string,
  verbose: boolean,
): SkillDefinition | null {
  let content: string
  try {
    content = fs.readFileSync(skillFilePath, 'utf8')
  } catch {
    if (verbose) console.error(`Failed to read skill file: ${skillFilePath}`)
    return null
  }
  return parseSkillFileContent(content, {
    directoryName: path.basename(skillDir),
    filePath: skillFilePath,
    verbose,
  })
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
 * Resolves the directories a load will search, in precedence order (later
 * overrides earlier).
 *
 * `homeDir` is an explicit INPUT rather than an ambient `os.homedir()` lookup,
 * and that is the point. A home directory only means something when this
 * process belongs to the user whose skills those are — true for the CLI,
 * false for any server that embeds this SDK. Making it a parameter means the
 * home directory cannot be searched by default, by omission, or by accident:
 * some caller has to have said "this process is that user's".
 *
 * See `LoadSkillsOptions.includeHomeSkills` for the history.
 *
 * Exported for tests, which assert on the resolved paths directly — that is
 * the check that stops the home fallback from silently coming back.
 */
export function resolveSkillsDirs(options: {
  cwd: string
  skillsPath?: string
  homeDir?: string
}): string[] {
  const { cwd, skillsPath, homeDir } = options
  if (skillsPath) return [skillsPath]
  return [
    // Global directories (Claude-compatible first, then Codebuff). Present
    // only when a home directory was explicitly supplied.
    ...(homeDir
      ? [
          path.join(homeDir, '.claude', SKILLS_DIR_NAME),
          path.join(homeDir, '.agents', SKILLS_DIR_NAME),
        ]
      : []),
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
  /**
   * Also search `~/.claude/skills` and `~/.agents/skills`. Defaults to FALSE.
   *
   * Off by default because the failure modes are wildly asymmetric. A host that
   * legitimately wants home skills and forgets this flag shows the user fewer
   * skills than they expected — loud, harmless, and immediately obvious to the
   * person who wrote those skills. A host that must NOT read a home directory
   * and gets one by default reads the WRONG MACHINE's files and feeds them to a
   * model, which looks exactly like working correctly.
   *
   * That second case was real: Freebuff Cloud embeds the runner in the
   * freebuff/web server process while the repo lives in a Daytona sandbox, so
   * the old always-on home search made every Cloud turn parse the web server's
   * `~/.claude/skills` and offer it to the model.
   *
   * Set it when this process belongs to the user whose skills these are — an
   * interactive CLI on their own machine. Leave it unset in anything
   * server-side, and in anything acting on a repo that lives elsewhere.
   */
  includeHomeSkills?: boolean
}

/**
 * Load skills from .agents/skills and .claude/skills directories.
 *
 * By default, searches PROJECT directories only (later overrides earlier):
 * - `{cwd}/.claude/skills/` (project, Claude Code compatible)
 * - `{cwd}/.agents/skills/` (project, highest priority)
 *
 * The user's home directory is searched only with `includeHomeSkills: true`,
 * which prepends (at lower precedence than the project ones):
 * - `~/.claude/skills/` (global, Claude Code compatible)
 * - `~/.agents/skills/` (global)
 *
 * Each skill must be in its own directory with a SKILL.md file:
 * - `.agents/skills/my-skill/SKILL.md`
 * - `.claude/skills/my-skill/SKILL.md`
 *
 * @param options.cwd - Working directory for project skills
 * @param options.skillsPath - Optional path to a specific skills directory
 * @param options.verbose - Whether to log errors during loading
 * @param options.includeHomeSkills - Opt in to the user's global skills. Only
 *   correct when this process belongs to that user; see the option's docs.
 * @returns Record of skill definitions keyed by skill name
 *
 * @example
 * ```typescript
 * // Project skills only — the safe default, and what a server wants
 * const skills = await loadSkills({ cwd })
 *
 * // An interactive CLI on the user's own machine also wants their globals
 * const skills = await loadSkills({ cwd, includeHomeSkills: true })
 *
 * // Load from a specific directory
 * const skills = await loadSkills({ skillsPath: './my-skills' })
 *
 * // Access a skill
 * const gitReleaseSkill = skills['git-release']
 * console.log(gitReleaseSkill.description)
 * ```
 */
export function loadSkillsSync(options: LoadSkillsOptions = {}): SkillsMap {
  const {
    cwd = process.cwd(),
    skillsPath,
    verbose = false,
    includeHomeSkills = false,
  } = options

  const skills: SkillsMap = {}

  const skillsDirs = resolveSkillsDirs({
    cwd,
    skillsPath,
    // The ONLY `os.homedir()` call in this module. Reaching it requires an
    // explicit opt-in, so no future caller inherits a home-directory read.
    homeDir: includeHomeSkills ? os.homedir() : undefined,
  })

  for (const skillsDir of skillsDirs) {
    const dirSkills = discoverSkillsFromDirectory(skillsDir, verbose)
    // Later directories override earlier ones (project overrides global)
    Object.assign(skills, dirSkills)
  }

  return skills
}

/** Async-compatible public loader retained for existing callers. */
export async function loadSkills(
  options: LoadSkillsOptions = {},
): Promise<SkillsMap> {
  return loadSkillsSync(options)
}
