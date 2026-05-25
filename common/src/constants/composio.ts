export const COMPOSIO_API_KEY_ENV_VAR = 'COMPOSIO_API_KEY'

export const COMPOSIO_META_TOOL_NAMES = [
  'composio_manage_connections',
  'composio_multi_execute_tool',
  'composio_search_tools',
  'composio_get_tool_schemas',
] as const

export type ComposioMetaToolName = (typeof COMPOSIO_META_TOOL_NAMES)[number]

export const COMPOSIO_META_TOOL_NAME_TO_UPSTREAM = {
  composio_manage_connections: 'COMPOSIO_MANAGE_CONNECTIONS',
  composio_multi_execute_tool: 'COMPOSIO_MULTI_EXECUTE_TOOL',
  composio_search_tools: 'COMPOSIO_SEARCH_TOOLS',
  composio_get_tool_schemas: 'COMPOSIO_GET_TOOL_SCHEMAS',
} as const satisfies Record<ComposioMetaToolName, string>

export type ComposioUpstreamMetaToolName =
  (typeof COMPOSIO_META_TOOL_NAME_TO_UPSTREAM)[ComposioMetaToolName]

const COMPOSIO_META_TOOL_NAME_SET = new Set<string>(COMPOSIO_META_TOOL_NAMES)

export function isComposioMetaToolName(
  toolName: string,
): toolName is ComposioMetaToolName {
  return COMPOSIO_META_TOOL_NAME_SET.has(toolName)
}

export function getComposioUpstreamToolName(
  toolName: ComposioMetaToolName,
): ComposioUpstreamMetaToolName {
  return COMPOSIO_META_TOOL_NAME_TO_UPSTREAM[toolName]
}
