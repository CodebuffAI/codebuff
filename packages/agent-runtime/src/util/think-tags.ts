/**
 * Strip XML-style <think> scaffolding from a model response.
 *
 * Handles:
 * - Paired tags: <think>...</think>
 * - Unclosed open tags: <think>... (truncated mid-thought)
 * - Orphan close tags: </think>
 *
 * Orphan closes show up with native-reasoning models (notably Kimi via
 * Alibaba/Infron): reasoning lands in `reasoning_content`, then content is
 * sometimes just `"</think> "`. Treating that as real text ends the agent
 * turn with no tool calls.
 */
export function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .replace(/<\/think>/g, '')
    .trim()
}

/**
 * True when the response is non-empty but only think-tag scaffolding (no
 * other non-whitespace content). Such steps should continue rather than end
 * the turn.
 */
export function isThinkOnlyResponse(fullResponse: string): boolean {
  const trimmed = fullResponse.trim()
  if (trimmed.length === 0) {
    return false
  }
  return stripThinkTags(fullResponse).length === 0
}
