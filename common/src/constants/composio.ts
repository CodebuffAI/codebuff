export const COMPOSIO_API_KEY_ENV_VAR = 'COMPOSIO_API_KEY'

export const COMPOSIO_META_TOOL_NAMES = [
  'COMPOSIO_MANAGE_CONNECTIONS',
  'COMPOSIO_MULTI_EXECUTE_TOOL',
  'COMPOSIO_SEARCH_TOOLS',
  'COMPOSIO_GET_TOOL_SCHEMAS',
] as const

export type ComposioMetaToolName = (typeof COMPOSIO_META_TOOL_NAMES)[number]

const COMPOSIO_META_TOOL_NAME_SET = new Set<string>(COMPOSIO_META_TOOL_NAMES)

export function isComposioMetaToolName(
  toolName: string,
): toolName is ComposioMetaToolName {
  return COMPOSIO_META_TOOL_NAME_SET.has(toolName)
}
