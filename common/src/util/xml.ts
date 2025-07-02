/**
 * Generate a closing XML tag for a single tool name
 * @param toolName Single tool name to generate closing tag for
 * @returns Closing XML tag string
 */
export function closeXml(toolName: string): string {
  return `</${toolName}>`
}

/**
 * Generate stop sequences (closing XML tags) for a list of tool names
 * @param toolNames Array of tool names to generate closing tags for
 * @returns Array of closing XML tag strings
 */
export function closeXmlTags(toolNames: readonly string[]): string[] {
  return toolNames.map((toolName) => closeXml(toolName))
}
