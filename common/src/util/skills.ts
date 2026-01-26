import type { SkillsMap } from '../types/skill'

/**
 * Escapes special XML characters in a string.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Formats available skills as XML for inclusion in tool descriptions.
 */
export function formatAvailableSkillsXml(skills: SkillsMap): string {
  const skillEntries = Object.values(skills)
  if (skillEntries.length === 0) {
    return ''
  }

  const skillsXml = skillEntries
    .map(
      (skill) =>
        `  <skill>\n    <name>${skill.name}</name>\n    <description>${escapeXml(skill.description)}</description>\n  </skill>`,
    )
    .join('\n')

  return `<available_skills>\n${skillsXml}\n</available_skills>`
}

/**
 * Formats skills as a system prompt section for injection into agent prompts.
 * Returns a markdown section with available skills and instructions on using the skill tool.
 * Returns empty string if no skills are available.
 */
export function formatSkillsSystemPrompt(skills: SkillsMap | undefined): string {
  if (!skills) {
    return ''
  }

  const skillEntries = Object.values(skills)
  if (skillEntries.length === 0) {
    return ''
  }

  const skillsXml = formatAvailableSkillsXml(skills)

  return `# Available Skills

The following skills are available to help you complete tasks. Each skill provides specialized instructions and behaviors.

${skillsXml}

Use the \`skill\` tool to load a skill's full instructions when relevant to the current task. Skills are loaded on-demand - only load them when you need their specific guidance. Always load any relevant skills immediately: You should bias toward loading too many skills as early as possible.`
}
