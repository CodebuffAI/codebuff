#!/usr/bin/env bun

/**
 * Test script to measure how long Fireworks prompt caching persists across
 * idle intervals. Sends an initial priming request, then waits various
 * intervals before sending follow-up requests that share the same prefix.
 *
 * The script reports the cache hit rate after each wait interval so you can
 * identify where prompt caching stops working (e.g. after 5 min, 30 min, etc.)
 *
 * Usage:
 *   bun scripts/test-fireworks-cache-intervals.ts [model] [--deployment] [--intervals=30,60,120,300,600,1200,1800]
 *
 * Models:
 *   glm-5.1   (default) — z-ai/glm-5.1
 *   minimax             — minimax/minimax-m2.5
 *
 * Flags:
 *   --deployment               Use custom deployment instead of serverless
 *   --intervals=a,b,c          Comma-separated wait intervals in SECONDS
 *                              (default: 30,60,120,300,600,900,1500,2100)
 *
 * Examples:
 *   # Default glm-5.1 serverless with default intervals
 *   bun scripts/test-fireworks-cache-intervals.ts
 *
 *   # Custom GLM deployment with a faster sweep
 *   bun scripts/test-fireworks-cache-intervals.ts glm-5.1 --deployment --intervals=30,60,120,300,600
 *
 *   # Long sweep up to 1 hour
 *   bun scripts/test-fireworks-cache-intervals.ts glm-5.1 --deployment --intervals=60,300,600,1200,1800,2700,3600
 */

export {}

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1'

type ModelConfig = {
  id: string
  standardModel: string
  deploymentModel?: string
  inputCostPerToken: number
  cachedInputCostPerToken: number
  outputCostPerToken: number
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'glm-5.1': {
    id: 'z-ai/glm-5.1',
    standardModel: 'accounts/fireworks/models/glm-5p1',
    deploymentModel: 'accounts/james-65d217/deployments/mjb4i7ea',
    inputCostPerToken: 1.4 / 1_000_000,
    cachedInputCostPerToken: 0.26 / 1_000_000,
    outputCostPerToken: 4.4 / 1_000_000,
  },
  minimax: {
    id: 'minimax/minimax-m2.5',
    standardModel: 'accounts/fireworks/models/minimax-m2p5',
    deploymentModel: 'accounts/james-65d217/deployments/lnfid5h9',
    inputCostPerToken: 0.3 / 1_000_000,
    cachedInputCostPerToken: 0.03 / 1_000_000,
    outputCostPerToken: 1.2 / 1_000_000,
  },
}

const DEFAULT_MODEL = 'glm-5.1'
const DEFAULT_INTERVALS_SEC = [30, 60, 120, 300, 600, 900, 1500, 2100]

function parseArgs(): {
  modelKey: string
  useDeployment: boolean
  intervals: number[]
} {
  const args = process.argv.slice(2)
  let modelKey = DEFAULT_MODEL
  let useDeployment = false
  let intervals = DEFAULT_INTERVALS_SEC

  for (const arg of args) {
    if (arg === '--deployment') {
      useDeployment = true
    } else if (arg.startsWith('--intervals=')) {
      const raw = arg.slice('--intervals='.length)
      const parsed = raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0)
      if (parsed.length === 0) {
        console.error(`❌ Invalid --intervals value: "${raw}"`)
        process.exit(1)
      }
      intervals = parsed
    } else if (!arg.startsWith('-')) {
      modelKey = arg
    }
  }

  if (!MODEL_CONFIGS[modelKey]) {
    console.error(
      `❌ Unknown model: "${modelKey}". Available models: ${Object.keys(MODEL_CONFIGS).join(', ')}`,
    )
    process.exit(1)
  }

  return { modelKey, useDeployment, intervals }
}

const { modelKey, useDeployment: USE_DEPLOYMENT, intervals: INTERVALS_SEC } =
  parseArgs()
const MODEL = MODEL_CONFIGS[modelKey]
if (USE_DEPLOYMENT && !MODEL.deploymentModel) {
  console.error(`❌ No custom deployment configured for ${MODEL.id}`)
  process.exit(1)
}
const FIREWORKS_MODEL = USE_DEPLOYMENT
  ? MODEL.deploymentModel!
  : MODEL.standardModel
const INPUT_COST_PER_TOKEN = MODEL.inputCostPerToken
const CACHED_INPUT_COST_PER_TOKEN = MODEL.cachedInputCostPerToken
const OUTPUT_COST_PER_TOKEN = MODEL.outputCostPerToken

const MAX_TOKENS = 50 // keep output small; we only care about cache behaviour

// Stable session ID so all requests route to the same machine for prompt caching
const SESSION_ID = `cache-test-${Math.random().toString(36).slice(2, 10)}`

// Unique seed per run so the cache prefix is specific to this script invocation
// (avoids hits from unrelated prior runs polluting results)
const SEED_STRING = `Run seed: ${Math.random().toString(36).slice(2, 10)}-${Date.now()}`

function computeCost(usage: Record<string, unknown>): number {
  const inputTokens =
    typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens =
    typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const promptDetails = usage.prompt_tokens_details as
    | Record<string, unknown>
    | undefined
  const cachedTokens =
    typeof promptDetails?.cached_tokens === 'number'
      ? promptDetails.cached_tokens
      : 0
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens)

  return (
    nonCachedInput * INPUT_COST_PER_TOKEN +
    cachedTokens * CACHED_INPUT_COST_PER_TOKEN +
    outputTokens * OUTPUT_COST_PER_TOKEN
  )
}

// Large system prompt (~5k+ tokens) borrowed in spirit from test-fireworks-long.ts.
// All content is invariant across requests except the per-run SEED_STRING so
// prefix caching has a large shared prefix to hit on.
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

// The user message is shared across all requests so the full prefix
// (system + first user turn) is eligible for caching. Only the final
// short user prompt differs per request.
const SHARED_USER_PROMPT =
  'I have a high-level question about the system. Give me your short, direct opinion based on the context above.'

// Short unique trailing questions so we still get a real response each time.
// Keep them short — they should not bust the cache of the shared prefix.
const TRAILING_QUESTIONS = [
  'What is the single biggest reliability risk?',
  'What would you prioritize improving first?',
  'Where is the biggest cost-saving opportunity?',
  'What architectural debt worries you most?',
  'Which SLO is likely most fragile?',
  'What is your top observability blind spot?',
  'Where is latency most likely to regress?',
  'What is the riskiest deployment pattern here?',
  'Which subsystem would you most worry about scaling?',
  'What is your top security concern?',
  'Where is the data consistency story weakest?',
  'What would you refactor first given the team size?',
  'Which failure mode is most likely under-tested?',
  'Where is on-call pain most likely to come from?',
  'What cache layer is most likely to cause an incident?',
  'Which third-party dependency concerns you most?',
  'What metric would you add to the dashboard first?',
  'Where would you invest engineering time next quarter?',
  'What is the biggest knowledge silo risk?',
  'Which migration would you delay if resources were tight?',
]

interface ConversationMessage {
  role: string
  content: string
}

interface TurnResult {
  label: string
  waitedSec: number
  usage: Record<string, unknown> | null
  elapsedMs: number
  ttftMs?: number
  outputTokens: number
  cost: number
  inputTokens: number
  cachedTokens: number
  cacheRate: number
  error?: string
}

async function sendRequest(
  label: string,
  waitedSec: number,
  apiKey: string,
  trailingQuestion: string,
): Promise<TurnResult> {
  const messages: ConversationMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: SHARED_USER_PROMPT },
    // A stable first assistant turn so the "prefix" grows — Fireworks will
    // cache system + user + assistant. Then we append a fresh user question.
    {
      role: 'assistant',
      content:
        'Understood. Ask the question and I will respond with a concise, opinionated answer.',
    },
    { role: 'user', content: trailingQuestion },
  ]

  const startTime = Date.now()
  let ttftMs: number | undefined

  const response = await fetch(`${FIREWORKS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'x-session-affinity': SESSION_ID,
    },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ ${label}: API returned ${response.status}: ${errorText}`)
    return {
      label,
      waitedSec,
      usage: null,
      elapsedMs: Date.now() - startTime,
      outputTokens: 0,
      cost: 0,
      inputTokens: 0,
      cachedTokens: 0,
      cacheRate: 0,
      error: `${response.status}: ${errorText}`,
    }
  }

  const reader = response.body?.getReader()
  if (!reader) {
    return {
      label,
      waitedSec,
      usage: null,
      elapsedMs: Date.now() - startTime,
      outputTokens: 0,
      cost: 0,
      inputTokens: 0,
      cachedTokens: 0,
      cacheRate: 0,
      error: 'no reader',
    }
  }

  const decoder = new TextDecoder()
  let streamUsage: Record<string, unknown> | null = null
  let firstContentChunkTime: number | undefined
  let streamContent = ''

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
        if (delta && firstContentChunkTime === undefined) {
          firstContentChunkTime = Date.now()
          ttftMs = firstContentChunkTime - startTime
        }
        if (delta?.content) streamContent += delta.content
        if (chunk.usage) streamUsage = chunk.usage
      } catch {
        // skip non-JSON lines
      }
    }
  }

  const elapsedMs = Date.now() - startTime
  const inputTokens =
    streamUsage && typeof streamUsage.prompt_tokens === 'number'
      ? streamUsage.prompt_tokens
      : 0
  const outputTokens =
    streamUsage && typeof streamUsage.completion_tokens === 'number'
      ? streamUsage.completion_tokens
      : 0
  const promptDetails = streamUsage?.prompt_tokens_details as
    | Record<string, unknown>
    | undefined
  const cachedTokens =
    typeof promptDetails?.cached_tokens === 'number'
      ? promptDetails.cached_tokens
      : 0
  const cacheRate = inputTokens > 0 ? (cachedTokens / inputTokens) * 100 : 0
  const cost = streamUsage ? computeCost(streamUsage) : 0

  const waitedStr =
    waitedSec > 0 ? `after ${formatDuration(waitedSec)} wait` : 'cold prime'
  console.log(
    `   ✅ ${label.padEnd(28)} | ${waitedStr.padEnd(22)} | ${(
      elapsedMs / 1000
    )
      .toFixed(2)
      .padStart(5)}s | TTFT ${
      ttftMs !== undefined ? (ttftMs / 1000).toFixed(2) + 's' : 'n/a'
    } | in ${String(inputTokens).padStart(5)} (cached ${String(
      cachedTokens,
    ).padStart(5)}, ${cacheRate.toFixed(1).padStart(5)}%) | out ${String(
      outputTokens,
    ).padStart(3)} | $${cost.toFixed(6)}`,
  )
  if (streamContent) {
    const preview = streamContent.replace(/\s+/g, ' ').slice(0, 120)
    console.log(
      `      ↳ ${preview}${streamContent.length > 120 ? '...' : ''}`,
    )
  }

  return {
    label,
    waitedSec,
    usage: streamUsage,
    elapsedMs,
    ttftMs,
    outputTokens,
    cost,
    inputTokens,
    cachedTokens,
    cacheRate,
  }
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (s === 0) return `${m}m`
  return `${m}m${s}s`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sleepWithProgress(totalMs: number, label: string) {
  if (totalMs <= 0) return
  const start = Date.now()
  const end = start + totalMs
  // Print a dot every 10 seconds so the user knows we're still alive
  process.stdout.write(`   ⏳ ${label}: waiting ${formatDuration(Math.round(totalMs / 1000))}`)
  while (Date.now() < end) {
    const remainingMs = end - Date.now()
    const sliceMs = Math.min(10_000, remainingMs)
    await sleep(sliceMs)
    const elapsedSec = Math.round((Date.now() - start) / 1000)
    process.stdout.write(`. (${elapsedSec}s)`)
  }
  process.stdout.write('\n')
}

function printRollingSummary(
  results: TurnResult[],
  plannedIntervalsSec: number[],
) {
  const probes = results.slice(1) // skip priming
  if (probes.length === 0) return
  const completed = probes.length
  const total = plannedIntervalsSec.length
  const cumulativeWaitSec = plannedIntervalsSec
    .slice(0, completed)
    .reduce((a, b) => a + b, 0)
  const remainingWaitSec = plannedIntervalsSec
    .slice(completed)
    .reduce((a, b) => a + b, 0)

  const lastHit = [...probes].reverse().find((r) => r.cachedTokens > 0)
  const firstMiss = probes.find(
    (r) => r.cachedTokens === 0 && !r.error && r.inputTokens > 0,
  )

  console.log(
    `   📊 Progress: ${completed}/${total} probes done — cumulative idle ${formatDuration(
      cumulativeWaitSec,
    )}, ${formatDuration(remainingWaitSec)} of waits remaining.`,
  )
  if (lastHit && !firstMiss) {
    console.log(
      `      Cache still alive — last hit after ${formatDuration(lastHit.waitedSec)} idle.`,
    )
  } else if (lastHit && firstMiss) {
    // Intervals are usually monotonically increasing, but guard against
    // user-supplied non-monotonic intervals by ordering the bounds.
    const lo = Math.min(lastHit.waitedSec, firstMiss.waitedSec)
    const hi = Math.max(lastHit.waitedSec, firstMiss.waitedSec)
    console.log(
      `      Estimated cache TTL so far: between ${formatDuration(lo)} (hit) and ${formatDuration(hi)} (miss).`,
    )
  } else if (firstMiss) {
    console.log(
      `      No cache hits observed yet — first miss after ${formatDuration(firstMiss.waitedSec)} idle.`,
    )
  }
}

async function main() {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey) {
    console.error(
      '❌ FIREWORKS_API_KEY is not set. Add it to .env.local or pass it directly.',
    )
    process.exit(1)
  }

  const totalWaitSec = INTERVALS_SEC.reduce((a, b) => a + b, 0)

  console.log('🧪 Fireworks Prompt Cache Interval Test')
  console.log('='.repeat(80))
  console.log(
    `Model:       ${MODEL.id} (${FIREWORKS_MODEL}) [${USE_DEPLOYMENT ? 'deployment' : 'serverless'}]`,
  )
  console.log(`Base URL:    ${FIREWORKS_BASE_URL}`)
  console.log(`Session ID:  ${SESSION_ID} (x-session-affinity header)`)
  console.log(`Seed:        ${SEED_STRING}`)
  console.log(`Max tokens:  ${MAX_TOKENS}`)
  console.log(
    `Intervals:   ${INTERVALS_SEC.map(formatDuration).join(', ')}  (total wait ≈ ${formatDuration(totalWaitSec)})`,
  )
  console.log('='.repeat(80))
  console.log()
  console.log(
    'Plan: send a priming request, then for each interval wait and re-send',
  )
  console.log(
    'a request that shares the full system/user/assistant prefix. Each test',
  )
  console.log(
    'also refreshes the cache, so interval N measures persistence after',
  )
  console.log(
    'the previous request. If caching is disabled or expired, cached_tokens',
  )
  console.log('will drop to ~0 and cache% will collapse.')
  console.log()

  const results: TurnResult[] = []

  // Prime the cache
  const priming = await sendRequest(
    'Priming (0)',
    0,
    apiKey,
    TRAILING_QUESTIONS[0],
  )
  results.push(priming)

  // Print an early verdict from priming so you know whether caching is
  // even plausible before sitting through the first wait.
  console.log()
  if (priming.error) {
    console.log(
      `   ⚠️  Priming request errored (${priming.error}). Subsequent probes will probably also fail.`,
    )
  } else {
    console.log(
      `   ℹ️  Priming prefix was ${priming.inputTokens} tokens (cached ${priming.cachedTokens} on the priming call itself — expected to be 0 on a cold run).`,
    )
  }
  console.log()

  let firstMissHintPrinted = false
  for (let i = 0; i < INTERVALS_SEC.length; i++) {
    const waitSec = INTERVALS_SEC[i]
    const questionIdx = (i + 1) % TRAILING_QUESTIONS.length
    const label = `Probe ${i + 1}/${INTERVALS_SEC.length}`
    await sleepWithProgress(waitSec * 1000, label)
    const result = await sendRequest(
      label,
      waitSec,
      apiKey,
      TRAILING_QUESTIONS[questionIdx],
    )
    results.push(result)
    printRollingSummary(results, INTERVALS_SEC)

    const isMiss =
      result.cachedTokens === 0 && !result.error && result.inputTokens > 0
    if (isMiss) {
      console.log(
        `   🔴 Cache MISS after ${formatDuration(waitSec)} idle. The cache likely expired.`,
      )
      if (!firstMissHintPrinted) {
        console.log(
          `      (Ctrl-C now if you don't want to wait through the remaining probes.)`,
        )
        firstMissHintPrinted = true
      }
    } else if (result.cachedTokens > 0) {
      console.log(
        `   🟢 Cache HIT after ${formatDuration(waitSec)} idle (${result.cacheRate.toFixed(1)}%).`,
      )
    }
    console.log()
  }

  // ── Summary ──
  console.log()
  console.log('━'.repeat(100))
  console.log('SUMMARY — cache hit rate vs. idle time since previous request')
  console.log('━'.repeat(100))
  console.log()
  console.log(
    '   Label                    | Waited      | Input  | Cached | Cache%  | TTFT    | Elapsed | Cost',
  )
  console.log('   ' + '-'.repeat(95))

  let totalCost = 0
  for (const r of results) {
    const waited = r.waitedSec > 0 ? formatDuration(r.waitedSec) : '—'
    const cacheStr = `${r.cacheRate.toFixed(1)}%`
    const ttft =
      r.ttftMs !== undefined ? `${(r.ttftMs / 1000).toFixed(2)}s` : 'n/a'
    const elapsed = `${(r.elapsedMs / 1000).toFixed(2)}s`
    totalCost += r.cost

    const indicator =
      r.cachedTokens > 0
        ? r.cacheRate >= 50
          ? '🟢'
          : '🟡'
        : r.waitedSec === 0
          ? '⬜'
          : '🔴'

    console.log(
      `   ${indicator} ${r.label.padEnd(22)} | ${waited.padStart(10)} | ${String(r.inputTokens).padStart(6)} | ${String(r.cachedTokens).padStart(6)} | ${cacheStr.padStart(7)} | ${ttft.padStart(7)} | ${elapsed.padStart(7)} | $${r.cost.toFixed(6)}${r.error ? ' [ERR]' : ''}`,
    )
  }
  console.log('   ' + '-'.repeat(95))
  console.log(`   Total cost: $${totalCost.toFixed(6)}`)
  console.log()

  // ── Analysis ──
  console.log('━'.repeat(100))
  console.log('ANALYSIS')
  console.log('━'.repeat(100))
  console.log()

  const probes = results.slice(1) // skip priming
  const firstMissIdx = probes.findIndex((r) => r.cachedTokens === 0)
  const lastHit = [...probes].reverse().find((r) => r.cachedTokens > 0)
  const firstMiss = firstMissIdx >= 0 ? probes[firstMissIdx] : null

  if (lastHit) {
    console.log(
      `   ✅ Last successful cache hit was after ${formatDuration(lastHit.waitedSec)} idle`,
    )
    console.log(
      `      (cached ${lastHit.cachedTokens}/${lastHit.inputTokens} tokens = ${lastHit.cacheRate.toFixed(1)}%)`,
    )
  } else {
    console.log(
      '   ⚠️  No probe returned any cached tokens — caching may be disabled for this deployment.',
    )
  }

  if (firstMiss) {
    console.log(
      `   🔴 First cache miss was after ${formatDuration(firstMiss.waitedSec)} idle (cache% = ${firstMiss.cacheRate.toFixed(1)}%)`,
    )
    console.log(
      `   ⏱  Estimated cache TTL is between ${formatDuration(
        lastHit ? lastHit.waitedSec : 0,
      )} and ${formatDuration(firstMiss.waitedSec)}.`,
    )
  } else {
    console.log(
      '   🟢 No cache misses observed across all tested intervals — cache persisted the full duration.',
    )
  }

  console.log()
  console.log('Notes:')
  console.log(
    '   • Cache misses on a serverless deployment can also be caused by request',
  )
  console.log(
    '     routing to a different node; we use x-session-affinity to mitigate this,',
  )
  console.log(
    '     but it is not a hard guarantee. Re-run if results look noisy.',
  )
  console.log(
    '   • Each probe refreshes the cache, so interval N measures persistence',
  )
  console.log('     since the previous request, not since the priming request.')
  console.log()
  console.log('Done!')
}

main()
