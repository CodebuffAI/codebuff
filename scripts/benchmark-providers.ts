#!/usr/bin/env bun

/**
 * Combined benchmark: runs Fireworks, SiliconFlow, and CanopyWave
 * 10-turn conversation caching tests in parallel, then prints a
 * unified comparison table.
 *
 * Usage:
 *   bun scripts/benchmark-providers.ts
 */

export {}

// ── Pricing (same model across all providers) ──
const INPUT_COST_PER_TOKEN = 0.30 / 1_000_000
const CACHED_INPUT_COST_PER_TOKEN = 0.03 / 1_000_000
const OUTPUT_COST_PER_TOKEN = 1.20 / 1_000_000

const MAX_TOKENS = 100
const NUM_TURNS = 10

// ── Provider configs ──

interface ProviderConfig {
  name: string
  baseUrl: string
  model: string
  apiKeyEnvVar: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/minimax-m2p5',
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
  },
  {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.com/v1',
    model: 'MiniMaxAI/MiniMax-M2.5',
    apiKeyEnvVar: 'SILICON_FLOW_API_KEY',
  },
  {
    name: 'CanopyWave',
    baseUrl: 'https://inference.canopywave.io/v1',
    model: 'minimax/minimax-m2.5',
    apiKeyEnvVar: 'CANOPYWAVE_API_KEY',
  },
]

// ── Shared system prompt (single seed so all providers get identical input) ──

const SEED_STRING = `Seed: ${Math.random().toString(36).slice(2, 10)}`

const SYSTEM_PROMPT = `You are an expert software architect, technical writer, and senior engineering consultant.
${SEED_STRING}
You always respond with brief, concise answers — one or two sentences at most.
You provide practical advice grounded in real-world engineering experience.

Your areas of expertise include:
- Distributed systems design and architecture patterns (microservices, event-driven, CQRS, saga patterns, choreography vs orchestration, bulkhead pattern, circuit breaker, retry with exponential backoff, sidecar pattern, ambassador pattern, strangler fig pattern, anti-corruption layer)
- Database design and optimization (relational databases including PostgreSQL, MySQL, SQL Server; document databases including MongoDB, CouchDB, DynamoDB; graph databases including Neo4j, ArangoDB, JanusGraph; time-series databases including InfluxDB, TimescaleDB, QuestDB; wide-column stores including Cassandra, ScyllaDB, HBase; sharding strategies including hash-based, range-based, geographic; replication topologies including primary-replica, multi-primary, chain replication; connection pooling with PgBouncer, ProxySQL; query optimization techniques including index selection, query plan analysis, materialized views, covering indexes, partial indexes, expression indexes)
- Cloud infrastructure and deployment (AWS services including EC2, ECS, EKS, Lambda, S3, DynamoDB, RDS, Aurora, ElastiCache, CloudFront, Route53, IAM, VPC, SQS, SNS, Kinesis, Step Functions; GCP services including GKE, Cloud Run, Cloud Functions, BigQuery, Spanner, Pub/Sub, Cloud Storage; Azure services including AKS, Azure Functions, Cosmos DB, Azure SQL; container orchestration with Kubernetes including deployments, stateful sets, daemon sets, jobs, CronJobs, custom resource definitions, operators, Helm charts, Kustomize; infrastructure as code with Terraform, Pulumi, CloudFormation, CDK; service mesh with Istio, Linkerd, Consul Connect; load balancers including ALB, NLB, HAProxy, Nginx, Envoy; auto-scaling including HPA, VPA, KEDA, cluster autoscaler)
- Programming languages and their ecosystems (TypeScript/JavaScript with Node.js, Deno, Bun; Python with FastAPI, Django, Flask, SQLAlchemy, Pydantic; Rust with Tokio, Actix, Axum, Serde; Go with Gin, Echo, GORM; Java with Spring Boot, Quarkus, Micronaut, Hibernate; C++ with Boost, gRPC, Abseil; Kotlin with Ktor, Spring; Scala with Akka, ZIO, Cats Effect; Elixir with Phoenix, Ecto, LiveView; Haskell with Servant, Yesod, Persistent)
- API design principles (REST architectural constraints, Richardson Maturity Model, HATEOAS, content negotiation; GraphQL including schema design, resolvers, DataLoader, subscriptions, federation; gRPC including protobuf schema design, streaming patterns, interceptors, deadline propagation; WebSocket patterns for real-time communication; Server-Sent Events for unidirectional streaming; OpenAPI/Swagger specification; API versioning strategies including URL path, header, query parameter; pagination patterns including cursor-based, offset, keyset; rate limiting algorithms including token bucket, leaky bucket, sliding window; API gateway patterns)
- Security best practices (authentication protocols including OAuth 2.0, OIDC, SAML, WebAuthn, FIDO2; authorization models including RBAC, ABAC, ReBAC, PBAC; encryption at rest with AES-256, at transit with TLS 1.3; OWASP Top 10 including injection, broken authentication, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, known vulnerabilities, insufficient logging; Content Security Policy headers; CORS configuration; DDoS mitigation with WAF, rate limiting, geo-blocking; secret management with HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager; certificate management including Let's Encrypt, cert-manager, mTLS; supply chain security with SBOM, Sigstore, dependency scanning)
- Performance optimization and profiling (caching strategies including write-through, write-behind, read-through, cache-aside, refresh-ahead; cache invalidation patterns; CDN configuration with CloudFront, Fastly, Cloudflare; connection pooling for HTTP, database, Redis; async patterns including event loops, worker threads, thread pools, coroutines; WebAssembly for compute-intensive operations; JIT compilation optimization; memory profiling with heap snapshots, allocation tracking; CPU profiling with flame graphs, perf, async-profiler; load testing with k6, Locust, Artillery, Gatling; performance budgets and real user monitoring)
- Testing methodologies (unit testing with Jest, Vitest, pytest, Go testing; integration testing with Testcontainers, Docker Compose; end-to-end testing with Playwright, Cypress, Selenium; property-based testing with fast-check, Hypothesis, QuickCheck; mutation testing with Stryker, PITest; snapshot testing; contract testing with Pact, Spring Cloud Contract; chaos engineering with Chaos Monkey, Litmus, Gremlin; load testing; fuzz testing with AFL, LibFuzzer; visual regression testing; accessibility testing)
- CI/CD pipelines and DevOps practices (GitHub Actions workflows, Jenkins pipelines, GitLab CI, CircleCI; ArgoCD for GitOps; deployment strategies including blue-green, canary, rolling update, recreate; feature flag systems with LaunchDarkly, Flagsmith, Unleash; trunk-based development; semantic versioning and conventional commits; artifact management with Artifactory, Nexus, ECR, GCR; infrastructure pipeline including Terraform plan/apply, drift detection; security scanning in CI including SAST, DAST, SCA, secret scanning; release management including changelogs, release notes, semantic-release)
- Monitoring and observability (metrics collection with Prometheus, StatsD, Datadog; visualization with Grafana, Kibana; distributed tracing with Jaeger, Zipkin, Tempo, OpenTelemetry; log aggregation with Elasticsearch, Loki, CloudWatch; alerting with PagerDuty, OpsGenie, VictorOps; SLO/SLI definition and error budgets; synthetic monitoring; real user monitoring; custom business metrics; incident management processes; postmortem culture; runbook automation)
- Data engineering and analytics (stream processing with Apache Kafka, Flink, Spark Streaming, Kinesis; batch processing with Spark, Hadoop, dbt; data warehousing with Snowflake, BigQuery, Redshift, ClickHouse; data lake architecture with Delta Lake, Apache Iceberg, Apache Hudi; ETL/ELT patterns; data quality frameworks with Great Expectations, dbt tests; schema evolution and backward compatibility; data governance and lineage tracking; real-time analytics with materialized views, OLAP cubes)
- Machine learning operations (model serving with TensorFlow Serving, TorchServe, Triton; MLOps pipelines with MLflow, Kubeflow, Metaflow; feature stores with Feast, Tecton; model monitoring for drift detection; A/B testing for ML models; experiment tracking; model versioning and registry; GPU cluster management; inference optimization with quantization, pruning, distillation)

When providing responses, you follow these conventions:
- Keep answers extremely brief — one or two sentences maximum
- Be direct and actionable
- Use concrete examples over abstract advice
- Reference specific tools, libraries, or patterns by name

Additional context for this conversation:
- We are working on a high-traffic web application that serves 50 million requests per day across 3 regions
- The system needs to handle bursty traffic patterns with 10x spikes during peak hours and flash sales
- Data consistency is important but eventual consistency is acceptable for most read paths with a 5-second staleness budget
- The team is experienced with TypeScript and Node.js but open to other technologies for specific use cases
- We use PostgreSQL 16 as our primary database with logical replication to read replicas and Redis 7 Cluster for caching
- The application is deployed on Kubernetes 1.29 in a multi-region setup across US-East-1, US-West-2, and EU-West-1
- We need to maintain 99.95% uptime SLA with a target p99 latency of 150ms for API endpoints and 50ms for cached reads
- Cost optimization is a secondary concern after reliability and developer experience, but we spend $2.5M/year on infrastructure
- The codebase is approximately 750k lines of TypeScript across 80+ microservices with an additional 200k lines of Python for ML services
- We use an event-driven architecture with Kafka (3 clusters, 500+ topics) for inter-service communication with exactly-once semantics
- All services expose both REST (OpenAPI 3.1) and gRPC (protobuf v3) endpoints with automatic code generation
- We have a comprehensive monitoring stack with Prometheus (50M time series), Grafana (200+ dashboards), Jaeger, and PagerDuty
- Database migrations are managed with Drizzle ORM with automated rollback capabilities and zero-downtime schema changes
- The frontend is a Next.js 15 application with React Server Components, streaming SSR, and partial prerendering
- We use feature flags extensively via LaunchDarkly with 500+ active flags and automated cleanup for stale flags
- The CI/CD pipeline runs 5000+ tests (unit, integration, e2e) with a target of under 8 minutes using distributed execution on BuildKite
- We practice trunk-based development with short-lived feature branches, PR previews, and automated merge queues
- The team consists of 60 engineers across 10 squads, each owning 5-12 services with clear domain boundaries
- We use a mono-repo structure managed with Turborepo and Bun workspaces with remote caching
- All inter-service communication uses Protocol Buffers for serialization with a shared schema registry and backward compatibility enforcement
- We have a custom API gateway built on Envoy that handles authentication, rate limiting, request routing, and observability injection
- The system processes approximately 100TB of data per day through our analytics pipeline (Kafka → Flink → ClickHouse + BigQuery)
- Mobile clients communicate via a BFF (Backend for Frontend) layer with GraphQL federation across 12 subgraphs
- We have a custom feature flag evaluation engine that supports complex targeting rules including percentage rollouts, user segments, and geographic targeting
- The deployment pipeline supports multi-region blue-green deployments with automated rollback on SLO violation detection
- We use HashiCorp Vault for secret management with automatic rotation policies for database credentials, API keys, and certificates
- Our observability stack includes custom instrumentation for business metrics including revenue, conversion, engagement, and error rates
- The team follows an RFC process for architectural decisions with ADRs stored in the repo and reviewed by the architecture guild
- We have a dedicated platform team of 8 engineers that maintains shared infrastructure, developer tooling, and internal SDKs
- All services implement health checks (liveness + readiness), graceful shutdown handlers, and circuit breakers via a shared middleware library
- We use PgBouncer in transaction mode for PostgreSQL connection pooling (max 500 connections per region) and Redis Cluster with 6 shards per region
- The system supports multi-tenancy with tenant isolation at the database level using row-level security and per-tenant connection pools
- We have a custom schema registry for Kafka topic schemas with backward/forward compatibility validation and automated consumer migration
- Our error handling follows a structured error taxonomy with 200+ error codes, retry policies, and dead-letter queues for unprocessable messages
- We use structured logging with JSON format, correlation IDs, and trace context propagation across all services via OpenTelemetry
- The frontend uses a design system with 300+ components maintained by a dedicated UI platform team with visual regression testing via Chromatic
- We have automated performance regression testing that runs nightly against production-like data with 10% traffic replay
- Our incident response process includes automated runbook execution, escalation policies, and post-incident review within 48 hours
- We maintain a service catalog with dependency graphs, SLO definitions, on-call schedules, and cost attribution per service
- The platform supports A/B testing with Bayesian statistical significance calculations, multi-armed bandit allocation, and segment analysis
- We use GitOps for all infrastructure management with Terraform modules in a dedicated repo and Atlantis for plan/apply workflows
- Our security posture includes weekly penetration testing, continuous dependency scanning with Snyk, SAST with Semgrep, and DAST with OWASP ZAP
- We have a data mesh architecture for analytics with 15 domain-owned data products, each with defined SLAs and data contracts
- The system supports webhook delivery with at-least-once semantics, configurable retry policies (exponential backoff up to 24h), and delivery status tracking
- We use OpenTelemetry Collector for telemetry pipeline with custom processors for PII redaction, sampling, and cost-based routing
- Our caching strategy uses L1 (in-process LRU, 100MB per pod), L2 (Redis Cluster, 500GB), and L3 (CloudFront, 30+ edge locations) with coordinated invalidation
- We maintain backward compatibility for 3 API versions simultaneously with automated deprecation notices, usage tracking, and migration guides
- The platform includes a developer portal with API documentation, SDK generation, sandbox environments, and usage analytics
- We use Temporal for workflow orchestration across 20+ long-running business processes including order fulfillment, payment processing, and user onboarding
- Our ML platform serves 50+ models in production with A/B testing, shadow mode deployment, and automated retraining pipelines
- The search infrastructure uses Elasticsearch clusters with 500M+ documents, custom analyzers, and learning-to-rank models
- We have a notification system that delivers 10M+ messages daily across email, push, SMS, and in-app channels with template management and delivery optimization
- The billing system processes $50M+ in monthly transactions with Stripe integration, usage-based billing, and revenue recognition
- We use Crossplane for provisioning cloud resources as Kubernetes custom resources with drift detection and reconciliation
- Our edge computing layer uses Cloudflare Workers for geo-routing, A/B test assignment, and personalization at the edge
- The platform includes a custom query builder for internal dashboards that generates optimized SQL for ClickHouse and PostgreSQL
- We maintain a shared protobuf definition repository with 500+ message types, automated code generation for 6 languages, and breaking change detection`

const TURN_PROMPTS = [
  'Give a brief one-sentence answer: What is the single most important principle when designing distributed systems?',
  'Give a brief one-sentence answer: What is the biggest mistake teams make when adopting microservices?',
  'Give a brief one-sentence answer: When should you choose eventual consistency over strong consistency?',
  'Give a brief one-sentence answer: What is the most underrated database optimization technique?',
  'Give a brief one-sentence answer: What is the best approach to handle cascading failures in a microservice architecture?',
  'Give a brief one-sentence answer: When is it better to use gRPC over REST?',
  'Give a brief one-sentence answer: What is the most effective caching strategy for a read-heavy workload?',
  'Give a brief one-sentence answer: What is the key to successful trunk-based development at scale?',
  'Give a brief one-sentence answer: What metric best predicts production reliability?',
  'Give a brief one-sentence answer: What is the most important thing to get right in an observability stack?',
]

// ── Types ──

interface ConversationMessage {
  role: string
  content: string
}

interface TurnResult {
  turn: number
  elapsedMs: number
  ttftMs?: number
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  outputTokensPerSec: number
  cost: number
  responseContent: string
  error?: string
}

interface ProviderResult {
  provider: ProviderConfig
  turns: TurnResult[]
  totalElapsedMs: number
  wallClockMs: number
}

// ── Helpers ──

function computeCost(usage: Record<string, unknown>): number {
  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined
  const cachedTokens = typeof promptDetails?.cached_tokens === 'number' ? promptDetails.cached_tokens : 0
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens)

  return nonCachedInput * INPUT_COST_PER_TOKEN +
    cachedTokens * CACHED_INPUT_COST_PER_TOKEN +
    outputTokens * OUTPUT_COST_PER_TOKEN
}

function extractUsageFields(usage: Record<string, unknown>): { inputTokens: number; cachedTokens: number; outputTokens: number } {
  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined
  const cachedTokens = typeof promptDetails?.cached_tokens === 'number' ? promptDetails.cached_tokens : 0
  return { inputTokens, cachedTokens, outputTokens }
}

async function runTurn(
  config: ProviderConfig,
  apiKey: string,
  messages: ConversationMessage[],
  turnIndex: number,
): Promise<TurnResult> {
  const startTime = Date.now()
  let ttftMs: number | undefined

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return {
      turn: turnIndex + 1,
      elapsedMs: Date.now() - startTime,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      outputTokensPerSec: 0,
      cost: 0,
      responseContent: '',
      error: `${response.status}: ${errorText.slice(0, 200)}`,
    }
  }

  const reader = response.body?.getReader()
  if (!reader) {
    return {
      turn: turnIndex + 1,
      elapsedMs: Date.now() - startTime,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      outputTokensPerSec: 0,
      cost: 0,
      responseContent: '',
      error: 'No response body reader',
    }
  }

  const decoder = new TextDecoder()
  let streamContent = ''
  let streamUsage: Record<string, unknown> | null = null
  let firstContentChunkTime: number | undefined

  let done = false
  while (!done) {
    const result = await reader.read()
    done = result.done
    if (done) break

    const text = decoder.decode(result.value, { stream: true })
    const lines = text.split('\n').filter((l) => l.startsWith('data: '))

    for (const line of lines) {
      const raw = line.slice('data: '.length)
      if (raw === '[DONE]') continue

      try {
        const chunk = JSON.parse(raw)
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) {
          if (firstContentChunkTime === undefined) {
            firstContentChunkTime = Date.now()
            ttftMs = firstContentChunkTime - startTime
          }
          streamContent += delta.content
        }
        if (chunk.usage) streamUsage = chunk.usage
      } catch {
        // skip non-JSON lines
      }
    }
  }

  const elapsedMs = Date.now() - startTime
  const { inputTokens, cachedTokens, outputTokens } = streamUsage
    ? extractUsageFields(streamUsage)
    : { inputTokens: 0, cachedTokens: 0, outputTokens: 0 }

  const generationTimeMs = firstContentChunkTime !== undefined
    ? Date.now() - firstContentChunkTime
    : elapsedMs
  const outputTokensPerSec = generationTimeMs > 0
    ? (outputTokens / (generationTimeMs / 1000))
    : 0

  const cost = streamUsage ? computeCost(streamUsage) : 0

  return {
    turn: turnIndex + 1,
    elapsedMs,
    ttftMs,
    inputTokens,
    cachedTokens,
    outputTokens,
    outputTokensPerSec,
    cost,
    responseContent: streamContent,
  }
}

async function runProviderBenchmark(config: ProviderConfig, apiKey: string): Promise<ProviderResult> {
  const conversationHistory: ConversationMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  const turns: TurnResult[] = []
  const wallStart = Date.now()
  let totalElapsedMs = 0

  for (let i = 0; i < NUM_TURNS; i++) {
    conversationHistory.push({ role: 'user', content: TURN_PROMPTS[i] })
    const result = await runTurn(config, apiKey, [...conversationHistory], i)
    turns.push(result)
    totalElapsedMs += result.elapsedMs

    if (result.responseContent) {
      conversationHistory.push({ role: 'assistant', content: result.responseContent })
    }
  }

  return {
    provider: config,
    turns,
    totalElapsedMs,
    wallClockMs: Date.now() - wallStart,
  }
}

// ── Formatting helpers ──

function pad(s: string, n: number): string { return s.padStart(n) }
function pct(n: number, d: number): string { return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '0.0%' }

function printProviderSummary(r: ProviderResult) {
  const p = r.provider
  console.log()
  console.log(`${'═'.repeat(100)}`)
  console.log(`  ${p.name}  |  Model: ${p.model}  |  Base URL: ${p.baseUrl}`)
  console.log(`${'═'.repeat(100)}`)
  console.log()
  console.log(`   ${'Turn'.padEnd(25)} | ${pad('Time', 8)} | ${pad('TTFT', 7)} | ${pad('Input', 6)} | ${pad('Cached', 6)} | ${pad('Cache%', 7)} | ${pad('Output', 6)} | ${pad('tok/s', 6)} | ${pad('e2e t/s', 7)} | Cost`)
  console.log('   ' + '─'.repeat(105))

  let totalCost = 0
  let totalInput = 0
  let totalCached = 0
  let totalOutput = 0

  for (const t of r.turns) {
    const label = `Turn ${t.turn}/${NUM_TURNS}${t.turn === 1 ? ' (cold)' : ''}`
    const time = `${(t.elapsedMs / 1000).toFixed(2)}s`
    const ttft = t.ttftMs !== undefined ? `${(t.ttftMs / 1000).toFixed(2)}s` : 'n/a'
    const cacheRate = pct(t.cachedTokens, t.inputTokens)
    const tokSec = t.outputTokensPerSec.toFixed(1)
    const e2eTokSec = t.elapsedMs > 0 ? (t.outputTokens / (t.elapsedMs / 1000)).toFixed(1) : 'n/a'
    const costStr = t.error ? 'err' : `$${t.cost.toFixed(6)}`

    totalCost += t.cost
    totalInput += t.inputTokens
    totalCached += t.cachedTokens
    totalOutput += t.outputTokens

    if (t.error) {
      console.log(`   ${label.padEnd(25)} | ${pad(time, 8)} | ${pad(ttft, 7)} | ❌ ${t.error.slice(0, 60)}`)
    } else {
      console.log(`   ${label.padEnd(25)} | ${pad(time, 8)} | ${pad(ttft, 7)} | ${pad(String(t.inputTokens), 6)} | ${pad(String(t.cachedTokens), 6)} | ${pad(cacheRate, 7)} | ${pad(String(t.outputTokens), 6)} | ${pad(tokSec, 6)} | ${pad(e2eTokSec, 7)} | ${costStr}`)
    }
  }

  console.log('   ' + '─'.repeat(105))
  const totalTimeStr = `${(r.totalElapsedMs / 1000).toFixed(2)}s`
  const overallCacheRate = pct(totalCached, totalInput)
  const overallTokSec = r.totalElapsedMs > 0 ? (totalOutput / (r.totalElapsedMs / 1000)).toFixed(1) : 'n/a'
  console.log(`   ${'TOTAL'.padEnd(25)} | ${pad(totalTimeStr, 8)} |         | ${pad(String(totalInput), 6)} | ${pad(String(totalCached), 6)} | ${pad(overallCacheRate, 7)} | ${pad(String(totalOutput), 6)} |        | ${pad(overallTokSec, 7)} | $${totalCost.toFixed(6)}`)
  console.log()

  const costWithoutCaching = totalInput * INPUT_COST_PER_TOKEN + totalOutput * OUTPUT_COST_PER_TOKEN
  const savings = costWithoutCaching - totalCost
  const savingsPct = costWithoutCaching > 0 ? ((savings / costWithoutCaching) * 100).toFixed(1) : '0.0'
  console.log(`   Cost savings from caching: $${savings.toFixed(6)} (${savingsPct}%)`)

  const ttfts = r.turns.filter((t) => t.ttftMs !== undefined).map((t) => t.ttftMs!)
  if (ttfts.length > 0) {
    const avgTtft = ttfts.reduce((a, b) => a + b, 0) / ttfts.length
    console.log(`   TTFT — avg: ${(avgTtft / 1000).toFixed(2)}s, min: ${(Math.min(...ttfts) / 1000).toFixed(2)}s, max: ${(Math.max(...ttfts) / 1000).toFixed(2)}s`)
  }
}

interface ProviderSummary {
  name: string
  totalTime: number
  wallClock: number
  cacheHitRate: number
  costSavings: number
  totalCost: number
  costWithoutCaching: number
  avgTtft: number | null
  avgWarmTtft: number | null
  e2eTokSec: number
  totalInput: number
  totalCached: number
  totalOutput: number
  cacheMissTurns: number
  errorTurns: number
}

function summarize(r: ProviderResult): ProviderSummary {
  let totalInput = 0
  let totalCached = 0
  let totalOutput = 0
  let totalCost = 0
  let cacheMissTurns = 0
  let errorTurns = 0

  for (const t of r.turns) {
    totalInput += t.inputTokens
    totalCached += t.cachedTokens
    totalOutput += t.outputTokens
    totalCost += t.cost
    if (t.error) errorTurns++
    else if (t.cachedTokens === 0) cacheMissTurns++
  }

  const cacheHitRate = totalInput > 0 ? (totalCached / totalInput) * 100 : 0
  const costWithoutCaching = totalInput * INPUT_COST_PER_TOKEN + totalOutput * OUTPUT_COST_PER_TOKEN
  const savings = costWithoutCaching > 0 ? ((costWithoutCaching - totalCost) / costWithoutCaching) * 100 : 0
  const e2eTokSec = r.totalElapsedMs > 0 ? totalOutput / (r.totalElapsedMs / 1000) : 0

  const ttfts = r.turns.filter((t) => t.ttftMs !== undefined).map((t) => t.ttftMs!)
  const avgTtft = ttfts.length > 0 ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : null

  const warmTtfts = r.turns.slice(1).filter((t) => t.ttftMs !== undefined).map((t) => t.ttftMs!)
  const avgWarmTtft = warmTtfts.length > 0 ? warmTtfts.reduce((a, b) => a + b, 0) / warmTtfts.length : null

  return {
    name: r.provider.name,
    totalTime: r.totalElapsedMs,
    wallClock: r.wallClockMs,
    cacheHitRate,
    costSavings: savings,
    totalCost,
    costWithoutCaching,
    avgTtft,
    avgWarmTtft,
    e2eTokSec,
    totalInput,
    totalCached,
    totalOutput,
    cacheMissTurns,
    errorTurns,
  }
}

function pickWinner(summaries: ProviderSummary[], key: keyof ProviderSummary, higherIsBetter: boolean): string {
  let best: ProviderSummary | null = null
  for (const s of summaries) {
    const val = s[key]
    if (val === null || val === undefined) continue
    if (!best) { best = s; continue }
    const bestVal = best[key] as number
    if (higherIsBetter ? (val as number) > bestVal : (val as number) < bestVal) best = s
  }
  return best ? `🏆 ${best.name}` : 'n/a'
}

function printComparisonTable(summaries: ProviderSummary[]) {
  console.log()
  console.log('█'.repeat(100))
  console.log('  HEAD-TO-HEAD COMPARISON')
  console.log('█'.repeat(100))
  console.log()

  const nameWidth = 14
  const colWidth = 16

  const header = `   ${'Metric'.padEnd(24)} | ${summaries.map((s) => s.name.padStart(colWidth)).join(' | ')} | Winner`
  console.log(header)
  console.log('   ' + '─'.repeat(header.length - 3))

  const rows: Array<{ label: string; values: string[]; winner: string }> = [
    {
      label: 'Total time',
      values: summaries.map((s) => `${(s.totalTime / 1000).toFixed(2)}s`),
      winner: pickWinner(summaries, 'totalTime', false),
    },
    {
      label: 'Wall clock',
      values: summaries.map((s) => `${(s.wallClock / 1000).toFixed(2)}s`),
      winner: pickWinner(summaries, 'wallClock', false),
    },
    {
      label: 'Cache hit rate',
      values: summaries.map((s) => `${s.cacheHitRate.toFixed(1)}%`),
      winner: pickWinner(summaries, 'cacheHitRate', true),
    },
    {
      label: 'Cost savings',
      values: summaries.map((s) => `${s.costSavings.toFixed(1)}%`),
      winner: pickWinner(summaries, 'costSavings', true),
    },
    {
      label: 'Total cost',
      values: summaries.map((s) => `$${s.totalCost.toFixed(6)}`),
      winner: pickWinner(summaries, 'totalCost', false),
    },
    {
      label: 'Avg TTFT',
      values: summaries.map((s) => s.avgTtft !== null ? `${(s.avgTtft / 1000).toFixed(2)}s` : 'n/a'),
      winner: (() => {
        const withTtft = summaries.filter((s) => s.avgTtft !== null)
        if (withTtft.length === 0) return 'n/a'
        return `🏆 ${withTtft.reduce((a, b) => a.avgTtft! < b.avgTtft! ? a : b).name}`
      })(),
    },
    {
      label: 'Avg warm TTFT',
      values: summaries.map((s) => s.avgWarmTtft !== null ? `${(s.avgWarmTtft / 1000).toFixed(2)}s` : 'n/a'),
      winner: (() => {
        const withTtft = summaries.filter((s) => s.avgWarmTtft !== null)
        if (withTtft.length === 0) return 'n/a'
        return `🏆 ${withTtft.reduce((a, b) => a.avgWarmTtft! < b.avgWarmTtft! ? a : b).name}`
      })(),
    },
    {
      label: 'e2e tok/s',
      values: summaries.map((s) => s.e2eTokSec.toFixed(1)),
      winner: pickWinner(summaries, 'e2eTokSec', true),
    },
    {
      label: 'Cache miss turns',
      values: summaries.map((s) => `${s.cacheMissTurns}/${NUM_TURNS}`),
      winner: pickWinner(summaries, 'cacheMissTurns', false),
    },
    {
      label: 'Error turns',
      values: summaries.map((s) => `${s.errorTurns}/${NUM_TURNS}`),
      winner: pickWinner(summaries, 'errorTurns', false),
    },
    {
      label: 'Total input tokens',
      values: summaries.map((s) => String(s.totalInput)),
      winner: '',
    },
    {
      label: 'Total output tokens',
      values: summaries.map((s) => String(s.totalOutput)),
      winner: '',
    },
  ]

  for (const row of rows) {
    const vals = row.values.map((v) => v.padStart(colWidth)).join(' | ')
    console.log(`   ${row.label.padEnd(24)} | ${vals} | ${row.winner}`)
  }

  console.log()
}

// ── Main ──

async function main() {
  console.log('🏁 Combined Provider Benchmark — 10-Turn Conversation Caching Test')
  console.log('='.repeat(100))
  console.log(`Turns:       ${NUM_TURNS}`)
  console.log(`Max tokens:  ${MAX_TOKENS} per turn`)
  console.log(`Pricing:     $0.30/M input, $0.03/M cached, $1.20/M output`)
  console.log(`Seed:        ${SEED_STRING}`)
  console.log(`Providers:   ${PROVIDERS.map((p) => p.name).join(', ')}`)
  console.log('='.repeat(100))
  console.log()

  // Validate API keys
  const validProviders: Array<{ config: ProviderConfig; apiKey: string }> = []
  const skippedProviders: string[] = []

  for (const config of PROVIDERS) {
    const apiKey = process.env[config.apiKeyEnvVar]
    if (!apiKey) {
      console.log(`⚠️  Skipping ${config.name}: ${config.apiKeyEnvVar} not set`)
      skippedProviders.push(config.name)
    } else {
      validProviders.push({ config, apiKey })
      console.log(`✅ ${config.name}: API key found`)
    }
  }

  if (validProviders.length === 0) {
    console.error('\n❌ No API keys found. Set at least one of: FIREWORKS_API_KEY, SILICON_FLOW_API_KEY, CANOPYWAVE_API_KEY')
    process.exit(1)
  }

  console.log()
  console.log(`🚀 Running ${validProviders.length} provider(s) in parallel...`)
  console.log()

  const benchmarkStart = Date.now()

  // Run all providers in parallel
  const results = await Promise.all(
    validProviders.map(({ config, apiKey }) => runProviderBenchmark(config, apiKey)),
  )

  const benchmarkElapsed = Date.now() - benchmarkStart

  // Print individual provider summaries
  for (const result of results) {
    printProviderSummary(result)
  }

  // Print comparison table
  if (results.length > 1) {
    const summaries = results.map(summarize)
    printComparisonTable(summaries)
  }

  // Final summary
  console.log('━'.repeat(100))
  console.log(`  Benchmark complete in ${(benchmarkElapsed / 1000).toFixed(1)}s wall clock (all providers ran in parallel)`)
  if (skippedProviders.length > 0) {
    console.log(`  Skipped: ${skippedProviders.join(', ')}`)
  }
  console.log('━'.repeat(100))
  console.log()
  console.log('Done!')
}

main()
