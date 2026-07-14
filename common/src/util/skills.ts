import type { SkillsMap } from '../types/skill'

const MAX_SKILL_CATALOG_DESCRIPTION_CHARS = 180

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
    .map((skill) => {
      const normalizedDescription = skill.description
        .replace(/\s+/g, ' ')
        .trim()
      const compactDescription =
        normalizedDescription.length > MAX_SKILL_CATALOG_DESCRIPTION_CHARS
          ? `${normalizedDescription.slice(0, MAX_SKILL_CATALOG_DESCRIPTION_CHARS - 1).trimEnd()}…`
          : normalizedDescription
      return `  <skill name="${escapeXml(skill.name)}" description="${escapeXml(compactDescription)}"/>`
    })
    .join('\n')

  return `<available_skills>\n${skillsXml}\n</available_skills>`
}
