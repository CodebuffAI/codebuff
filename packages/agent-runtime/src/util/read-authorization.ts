import type { AgentState } from '@codebuff/common/types/session-state'

/** Revoke implicit edit authority when compaction removes exact read bodies. */
export function revokeImplicitReadAuthorizationsAfterCompaction(
  agentState: AgentState,
): void {
  const paths = new Set([
    ...Object.keys(agentState.readAuthorizationsByPath ?? {}),
    ...Object.keys(agentState.readAuthorizationHashesByPath ?? {}),
  ])
  if (paths.size === 0) return

  agentState.editRereadRequirementsByPath ??= {}
  for (const path of paths) {
    agentState.editRereadRequirementsByPath[path] = {
      reason: 'context_compacted',
      sourceTool: 'context compaction',
    }
  }
  agentState.readAuthorizationsByPath = {}
  agentState.readAuthorizationHashesByPath = {}
}
