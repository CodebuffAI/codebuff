import type { AgentTemplate } from '../templates/types'

/**
 * Return the tools an agent is actually allowed to expose at runtime.
 *
 * Structured-output agents need `set_output` to publish their declared result
 * schema. Some older/dynamic templates declared `outputMode` without listing
 * that reporting tool, which left the model unable to finish and caused the
 * executor to reject an otherwise valid `set_output` call. This derived
 * capability is intentionally narrow: it adds no filesystem, process, network,
 * or delegation authority.
 */
export function getEffectiveAgentToolNames(
  agentTemplate: AgentTemplate,
): string[] {
  const names = [...agentTemplate.toolNames]
  if (
    agentTemplate.outputMode === 'structured_output' &&
    !names.includes('set_output')
  ) {
    names.push('set_output')
  }
  return names
}
