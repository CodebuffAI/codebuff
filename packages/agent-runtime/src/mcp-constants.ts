/**
 * Separator used between MCP server name and tool name.
 * 
 * LLM APIs (OpenRouter/Anthropic) only allow tool names matching the pattern
 * ^[a-zA-Z0-9_-]{1,128}$, which doesn't include forward slashes.
 * 
 * We use double underscore as the separator since it's:
 * - Allowed by the LLM API pattern
 * - Unlikely to conflict with existing tool names
 * - Clearly identifiable as a separator
 */
export const MCP_TOOL_SEPARATOR = '__'
