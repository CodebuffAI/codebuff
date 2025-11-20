export function getToolCallString(toolName: string, input: any) {
  return `<${toolName}>\n${(JSON.stringify(input), null, 2)}\n<\n${toolName}>`
}
