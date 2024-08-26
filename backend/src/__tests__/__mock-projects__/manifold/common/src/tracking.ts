export type ClickEvent = {
  type: 'click'
  contractId: string
  timestamp: number
}

export type LatencyEvent = {
  type: 'feed' | 'portfolio'
  latency: number
  timestamp: number
}
