type DirectAgentInput = Record<string, unknown>

function deepParseJson(value: unknown, depth = 0): unknown {
  if (depth >= 3) return value
  if (typeof value === 'string') {
    try {
      return deepParseJson(JSON.parse(value), depth + 1)
    } catch {
      return value
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepParseJson(item, depth + 1))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        deepParseJson(entry, depth + 1),
      ]),
    )
  }
  return value
}

export function buildSpawnAgentsInputForDirectAgentCall(params: {
  agentType: string
  input: unknown
}): { agents: DirectAgentInput[] } | undefined {
  let parsed: unknown = params.input
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return undefined
    }
  }
  parsed = deepParseJson(parsed)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined
  }

  const input = parsed as DirectAgentInput
  const entry: DirectAgentInput = { agent_type: params.agentType }
  for (const key of ['prompt', 'handoff', 'background', 'timeout_seconds']) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      entry[key] = input[key]
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'params')) {
    entry.params = input.params
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
