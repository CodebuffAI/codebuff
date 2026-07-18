import { parseJsonBounded } from '@codebuff/common/tools/params/utils'

type DirectAgentInput = Record<string, unknown>

export function buildSpawnAgentsInputForDirectAgentCall(params: {
  agentType: string
  input: unknown
}): { agents: DirectAgentInput[] } | undefined {
  const parsed = parseJsonBounded(params.input)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined
  }

  const input = parsed as DirectAgentInput
  const entry: DirectAgentInput = { agent_type: params.agentType }
  for (const key of ['prompt', 'background', 'timeout_seconds']) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      entry[key] = input[key]
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'handoff')) {
    entry.handoff = parseJsonBounded(input.handoff)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'params')) {
    entry.params = parseJsonBounded(input.params)
  } else {
    const legacyParams = Object.fromEntries(
      Object.entries(input).filter(
        ([key]) =>
          !['prompt', 'handoff', 'background', 'timeout_seconds'].includes(key),
      ),
    )
    if (Object.keys(legacyParams).length > 0) entry.params = legacyParams
  }

  return { agents: [entry] }
}
