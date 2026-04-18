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
    /** null when Fireworks doesn't emit a deployment_replicas gauge for the
     *  deployment (cold / deleted / not-yet-scraped). 0 means scaled-to-zero. */
    replicas: number | null
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
