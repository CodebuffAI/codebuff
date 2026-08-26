import {
  createSkillDefinition,
  SkillFrontmatterSchema,
  type SkillDefinition,
} from '../types/skill'
import matter from 'gray-matter'

/**
 * Parse and validate one SKILL.md document without touching disk.
 *
 * This lives in `common`, not in the SDK where it was born, because callers
 * that only need to READ a skill document must not be forced to load the SDK
 * barrel with it. That barrel pulls in tree-sitter, whose `.wasm` is resolved
 * from disk at import time — fine in the CLI, fatal in a Convex action, where
 * it fails with "tree-sitter.wasm not found (looked at scriptDir=/var/task/…)"
 * before any skill code runs. Observed in a real Convex deployment on
 * 2026-08-18, not predicted: the same import succeeds under Bun locally,
 * because there the wasm is sitting in node_modules where the resolver expects.
 *
 * The SDK re-exports this, so `parseSkillFileContent` remains one function with
 * one implementation. That matters more than where it lives: the writer in
 * Freebuff Cloud validates a draft by running the READER over it, and a second
 * copy would make that check a lookalike instead of the real thing.
 */
export function parseSkillFileContent(
  content: string,
  options: { directoryName: string; filePath: string; verbose?: boolean },
): SkillDefinition | null {
  const { directoryName, filePath, verbose = false } = options

  const parsed = parseFrontmatter(content)
  if (!parsed) {
    if (verbose) {
      console.error(`Invalid frontmatter in skill file: ${filePath}`)
    }
    return null
  }

  const result = SkillFrontmatterSchema.safeParse(parsed.frontmatter)
  if (!result.success) {
    if (verbose) {
      console.error(
        `Invalid skill frontmatter in ${filePath}: ${result.error.message}`,
      )
    }
    return null
  }

  const frontmatter = result.data

  // The name has to match the directory, or the loader cannot address the
  // skill: it finds skills BY directory and keys them by frontmatter name.
  if (frontmatter.name !== directoryName) {
    if (verbose) {
      console.error(
        `Skill name '${frontmatter.name}' does not match directory name '${directoryName}' in ${filePath}`,
      )
    }
    return null
  }

  return createSkillDefinition({ frontmatter, content, filePath })
}

/**
 * YAML frontmatter between `---` markers at the very top, or `null`.
 *
 * Empty frontmatter is `null` rather than an empty object: a SKILL.md with no
 * `name` cannot be addressed, so there is nothing for a caller to do with it.
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
