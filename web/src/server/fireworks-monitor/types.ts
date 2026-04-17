export interface PromSample {
  name: string
  labels: Record<string, string>
  value: number
}

export interface PromMetrics {
  samples: PromSample[]
  scrapedAt: number
}

export type DeploymentHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

export interface DeploymentHealth {
  deploymentId: string
  deployment: string
  baseModel: string | null
  status: DeploymentHealthStatus
  reasons: string[]
  metrics: {
    requestRate: number
    errorRate: number
    errorFraction: number
    concurrentRequests: number
    kvBlocksFraction: number
    kvSlotsFraction: number
    p50GenerationQueueMs: number | null
    p50TimeToFirstTokenMs: number | null
  }
}

export interface FireworksHealthSnapshot {
  scrapedAt: number | null
  ageMs: number | null
  overall: DeploymentHealthStatus
  deployments: Record<string, DeploymentHealth>
  lastError: string | null
}
