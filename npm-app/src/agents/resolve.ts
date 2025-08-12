import { DEFAULT_ORG_PREFIX } from '@codebuff/common/util/agent-name-normalization'

export function resolveCliAgentId(
  input: string | undefined,
  localAgentIds: string[],
): string | undefined {
  if (!input) return input

  // Preserve explicitly prefixed identifiers like publisher/name
  if (input.includes('/')) return input

  // If it exists locally, use as-is
  if (localAgentIds.includes(input)) return input

  // Otherwise default to <DEFAULT_ORG_PREFIX><name>
  return `${DEFAULT_ORG_PREFIX}${input}`
}
