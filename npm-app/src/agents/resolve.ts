export function resolveCliAgentId(
  input: string | undefined,
  localAgentIds: string[]
): string | undefined {
  if (!input) return input

  // Preserve explicitly prefixed identifiers like publisher/name
  if (input.includes('/')) return input

  // If it exists locally, use as-is
  if (localAgentIds.includes(input)) return input

  // Otherwise default to codebuff/<name>
  return `codebuff/${input}`
}
