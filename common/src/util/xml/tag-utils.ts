export function closeXml(toolName: string): string {
  return `</${toolName}>`
}

export function getStopSequences(toolNames: readonly string[]): string[] {
  return toolNames.map((toolName) => `</codebuff_tool_${toolName}>`)
}
