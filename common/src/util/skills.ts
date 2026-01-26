import type { SkillsMap } from '../types/skill'

/**
 * Escapes special XML characters in a string.
 */
function escapeXml(str: string): string {
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
