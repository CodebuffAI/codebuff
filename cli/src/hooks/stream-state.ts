// Mutable container for stream-local state shared across handlers.
export type SpawnAgentInfo = { index: number; agentType: string }

type StreamState = {
  rootStreamBuffer: string
  agentStreamAccumulators: Map<string, string>
  rootStreamSeen: boolean
  planExtracted: boolean
  wasAbortedByUser: boolean
  spawnAgentsMap: Map<string, SpawnAgentInfo>
}

export type StreamController = {
  state: StreamState
  reset: () => void
  setters: {
    setRootStreamBuffer: (value: string) => void
    appendRootStreamBuffer: (value: string) => void
    setAgentAccumulator: (agentId: string, value: string) => void
    removeAgentAccumulator: (agentId: string) => void
    setRootStreamSeen: (value: boolean) => void
    setPlanExtracted: (value: boolean) => void
    setWasAbortedByUser: (value: boolean) => void
    setSpawnAgentInfo: (agentId: string, info: SpawnAgentInfo) => void
    removeSpawnAgentInfo: (agentId: string) => void
  }
}

/**
 * Lightweight stream state container. Uses plain mutable objects rather than React refs
 * so it can be consumed by non-React helpers (event handlers, SDK callbacks).
 */
export const createStreamController = (): StreamController => {
  const state: StreamState = {
    rootStreamBuffer: '',
    agentStreamAccumulators: new Map(),
    rootStreamSeen: false,
    planExtracted: false,
    wasAbortedByUser: false,
    spawnAgentsMap: new Map(),
  }

  const reset = () => {
    state.rootStreamBuffer = ''
    state.agentStreamAccumulators = new Map()
    state.rootStreamSeen = false
    state.planExtracted = false
    state.wasAbortedByUser = false
    state.spawnAgentsMap = new Map()
  }

  const setters = {
    setRootStreamBuffer: (value: string) => {
      state.rootStreamBuffer = value
    },
    appendRootStreamBuffer: (value: string) => {
      state.rootStreamBuffer += value
    },
    setAgentAccumulator: (agentId: string, value: string) => {
      state.agentStreamAccumulators.set(agentId, value)
    },
    removeAgentAccumulator: (agentId: string) => {
      state.agentStreamAccumulators.delete(agentId)
    },
    setRootStreamSeen: (value: boolean) => {
      state.rootStreamSeen = value
    },
    setPlanExtracted: (value: boolean) => {
      state.planExtracted = value
    },
    setWasAbortedByUser: (value: boolean) => {
      state.wasAbortedByUser = value
    },
    setSpawnAgentInfo: (agentId: string, info: SpawnAgentInfo) => {
      state.spawnAgentsMap.set(agentId, info)
    },
    removeSpawnAgentInfo: (agentId: string) => {
      state.spawnAgentsMap.delete(agentId)
    },
  }

  return { reset, state, setters }
}
