import { v } from "convex/values";
import {
  CONTEXT_LENGTH_PRESETS,
  DEFAULT_CONTEXT_LENGTH,
  type ContextLength,
  type ContextLengthPreset,
} from "../../../lib/coding-agent/contextLengthPresets";

/**
 * Context Length Presets Configuration
 *
 * These presets control how much context is included in the agent's working memory.
 * Larger context = more expensive but better understanding of conversation history.
 *
 * To modify these presets, adjust the values below:
 * - chatThresholds: Controls message compaction thresholds (in tokens)
 *   - firstThreshold: Below this, use full message content
 *   - secondThreshold: Below this, use summarized content
 *   - thirdThreshold: Below this, use compact summarization
 * - fileTokensInContext: Maximum tokens for files read into context
 */

export const contextLengthValidator = v.union(
  v.literal("small"),
  v.literal("medium"),
  v.literal("long"),
);

export { CONTEXT_LENGTH_PRESETS, DEFAULT_CONTEXT_LENGTH };
export type { ContextLength, ContextLengthPreset };

/**
 * Get the preset configuration for a given context length.
 * Defaults to "small" if not specified.
 */
export function getContextLengthPreset(
  contextLength?: ContextLength,
): ContextLengthPreset {
  return CONTEXT_LENGTH_PRESETS[contextLength || DEFAULT_CONTEXT_LENGTH];
}
