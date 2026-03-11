#!/usr/bin/env bun

/**
 * Test script to verify Fireworks AI prompt caching across a 10-turn conversation.
 *
 * Uses a very large system prompt (~5k+ input tokens) with low output (max 100 tokens)
 * to measure how well Fireworks caches the shared prefix across turns.
 *
 * Usage:
 *   bun scripts/test-fireworks-long.ts
 */

export { }

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1'
// const FIREWORKS_MODEL = 'accounts/james-65d217/deployments/qne3jo8v'
const FIREWORKS_MODEL = 'accounts/fireworks/models/minimax-m2p5'

// Pricing constants — https://fireworks.ai/pricing
const INPUT_COST_PER_TOKEN = 0.30 / 1_000_000
const CACHED_INPUT_COST_PER_TOKEN = 0.03 / 1_000_000
const OUTPUT_COST_PER_TOKEN = 1.20 / 1_000_000

const MAX_TOKENS = 100

function computeCost(usage: Record<string, unknown>): { cost: number; breakdown: string } {
  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined
  const cachedTokens = typeof promptDetails?.cached_tokens === 'number' ? promptDetails.cached_tokens : 0
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens)

  const inputCost = nonCachedInput * INPUT_COST_PER_TOKEN
  const cachedCost = cachedTokens * CACHED_INPUT_COST_PER_TOKEN
  const outputCost = outputTokens * OUTPUT_COST_PER_TOKEN
  const totalCost = inputCost + cachedCost + outputCost

  const breakdown = [
    `${nonCachedInput} non-cached input × $0.30/M = $${inputCost.toFixed(8)}`,
    `${cachedTokens} cached input × $0.03/M = $${cachedCost.toFixed(8)}`,
    `${outputTokens} output × $1.20/M = $${outputCost.toFixed(8)}`,
    `Total: $${totalCost.toFixed(8)}`,
  ].join('\n         ')

  return { cost: totalCost, breakdown }
}

// Very large system prompt to push input tokens to ~5k+
// Random seed to prevent cache hits on repeated runs
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

interface ConversationMessage {
  role: string
  content: string
}

interface TurnResult {
  label: string
  usage: Record<string, unknown> | null
  elapsedMs: number
  outputTokens: number
  ttftMs?: number
  outputTokensPerSec?: number
  responseContent: string
}

async function makeConversationStreamRequest(
  label: string,
  apiKey: string,
  conversationMessages: ConversationMessage[],
): Promise<TurnResult> {
  console.log(`── ${label} (streaming) ──`)
  const startTime = Date.now()
  let ttftMs: number | undefined

  const response = await fetch(`${FIREWORKS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      messages: conversationMessages,
      max_tokens: MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ Fireworks streaming API returned ${response.status}: ${errorText}`)
    return { label, usage: null, elapsedMs: Date.now() - startTime, outputTokens: 0, responseContent: '' }
  }

  const reader = response.body?.getReader()
  if (!reader) {
    console.error('❌ No response body reader')
    return { label, usage: null, elapsedMs: Date.now() - startTime, outputTokens: 0, responseContent: '' }
  }

  const decoder = new TextDecoder()
  let streamContent = ''
  let chunkCount = 0
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
        chunkCount++
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) {
          if (firstContentChunkTime === undefined) {
            firstContentChunkTime = Date.now()
            ttftMs = firstContentChunkTime - startTime
          }
          streamContent += delta.content
        }
        if (delta?.reasoning_content) {
          // Skip reasoning content for this test
        }
        if (chunk.usage) streamUsage = chunk.usage
      } catch {
        // skip non-JSON lines
      }
    }
  }

  const elapsedMs = Date.now() - startTime
  const outputTokens = streamUsage && typeof streamUsage.completion_tokens === 'number'
    ? streamUsage.completion_tokens
    : 0

  const generationTimeMs = firstContentChunkTime !== undefined
    ? Date.now() - firstContentChunkTime
    : elapsedMs
  const outputTokensPerSec = generationTimeMs > 0
    ? (outputTokens / (generationTimeMs / 1000))
    : 0

  // Print compact per-turn stats
  const inputTokens = streamUsage && typeof streamUsage.prompt_tokens === 'number' ? streamUsage.prompt_tokens : 0
  const promptDetails = streamUsage?.prompt_tokens_details as Record<string, unknown> | undefined
  const cachedTokens = typeof promptDetails?.cached_tokens === 'number' ? promptDetails.cached_tokens : 0
  const cacheRate = inputTokens > 0 ? ((cachedTokens / inputTokens) * 100).toFixed(1) : '0.0'
  const cost = streamUsage ? `$${computeCost(streamUsage).cost.toFixed(6)}` : 'err'

  console.log(`   ✅ ${(elapsedMs / 1000).toFixed(2)}s | TTFT ${ttftMs !== undefined ? (ttftMs / 1000).toFixed(2) + 's' : 'n/a'} | ${inputTokens} in (${cachedTokens} cached, ${cacheRate}%) | ${outputTokens} out @ ${outputTokensPerSec.toFixed(1)} tok/s | ${cost}`)
  console.log(`   Response: ${streamContent.slice(0, 150)}${streamContent.length > 150 ? '...' : ''}`)
  console.log()

  return { label, usage: streamUsage, elapsedMs, outputTokens, ttftMs, outputTokensPerSec, responseContent: streamContent }
}

async function main() {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey) {
    console.error('❌ FIREWORKS_API_KEY is not set. Add it to .env.local or pass it directly.')
    process.exit(1)
  }

  console.log('🧪 Fireworks 10-Turn Conversation Caching Test')
  console.log('='.repeat(60))
  console.log(`Model:       ${FIREWORKS_MODEL}`)
  console.log(`Base URL:    ${FIREWORKS_BASE_URL}`)
  console.log(`Max tokens:  ${MAX_TOKENS} (low output per turn)`)
  console.log(`Turns:       ${TURN_PROMPTS.length}`)
  console.log(`Pricing:     $0.30/M input, $0.03/M cached, $1.20/M output`)
  console.log('='.repeat(60))
  console.log()

  const conversationHistory: ConversationMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  const results: TurnResult[] = []

  for (let i = 0; i < TURN_PROMPTS.length; i++) {
    conversationHistory.push({ role: 'user', content: TURN_PROMPTS[i] })

    const label = `Turn ${i + 1}/${TURN_PROMPTS.length}${i === 0 ? ' (cold)' : ''}`
    const result = await makeConversationStreamRequest(label, apiKey, [...conversationHistory])
    results.push(result)

    if (result.responseContent) {
      conversationHistory.push({ role: 'assistant', content: result.responseContent })
    }
  }

  // ── Summary table ──
  console.log('━'.repeat(120))
  console.log('SUMMARY')
  console.log('━'.repeat(120))
  console.log()

  console.log('   Turn | Time     | TTFT    | Input  | Cached | Cache%  | Output | tok/s  | e2e t/s | Cost')
  console.log('   ' + '-'.repeat(110))

  let totalCost = 0
  let totalInputTokens = 0
  let totalCachedTokens = 0
  let totalOutputTokens = 0
  let totalElapsedMs = 0

  for (const r of results) {
    const time = `${(r.elapsedMs / 1000).toFixed(2)}s`
    const ttft = r.ttftMs !== undefined ? `${(r.ttftMs / 1000).toFixed(2)}s` : 'n/a'
    const tokSec = r.outputTokensPerSec !== undefined ? r.outputTokensPerSec.toFixed(1) : 'n/a'
    const e2eTokSec = r.elapsedMs > 0 ? (r.outputTokens / (r.elapsedMs / 1000)).toFixed(1) : 'n/a'
    const cost = r.usage ? computeCost(r.usage).cost : 0
    const costStr = r.usage ? `$${cost.toFixed(6)}` : 'err'

    const inputTokens = r.usage && typeof r.usage.prompt_tokens === 'number' ? r.usage.prompt_tokens : 0
    const promptDetails = r.usage?.prompt_tokens_details as Record<string, unknown> | undefined
    const cachedTokens = typeof promptDetails?.cached_tokens === 'number' ? promptDetails.cached_tokens : 0
    const cacheRate = inputTokens > 0 ? `${((cachedTokens / inputTokens) * 100).toFixed(1)}%` : '0.0%'

    totalCost += cost
    totalInputTokens += inputTokens
    totalCachedTokens += cachedTokens
    totalOutputTokens += r.outputTokens
    totalElapsedMs += r.elapsedMs

    console.log(
      `   ${r.label.padEnd(4).slice(0, 25).padEnd(25)} | ${time.padStart(8)} | ${ttft.padStart(7)} | ${String(inputTokens).padStart(6)} | ${String(cachedTokens).padStart(6)} | ${cacheRate.padStart(7)} | ${String(r.outputTokens).padStart(6)} | ${tokSec.padStart(6)} | ${e2eTokSec.padStart(7)} | ${costStr}`,
    )
  }

  console.log('   ' + '-'.repeat(110))

  const overallCacheRate = totalInputTokens > 0 ? ((totalCachedTokens / totalInputTokens) * 100).toFixed(1) : '0.0'
  const totalTimeStr = `${(totalElapsedMs / 1000).toFixed(2)}s`
  const overallTokSec = totalElapsedMs > 0 ? (totalOutputTokens / (totalElapsedMs / 1000)).toFixed(1) : 'n/a'
  console.log(`   ${'TOTAL'.padEnd(25)} | ${totalTimeStr.padStart(8)} |         | ${String(totalInputTokens).padStart(6)} | ${String(totalCachedTokens).padStart(6)} | ${(overallCacheRate + '%').padStart(7)} | ${String(totalOutputTokens).padStart(6)} |        | ${overallTokSec.padStart(7)} | $${totalCost.toFixed(6)}`)
  console.log()

  // ── Cost analysis ──
  console.log('━'.repeat(120))
  console.log('COST ANALYSIS')
  console.log('━'.repeat(120))
  console.log()

  // What would the cost be without caching?
  const costWithoutCaching = totalInputTokens * INPUT_COST_PER_TOKEN + totalOutputTokens * OUTPUT_COST_PER_TOKEN
  const savings = costWithoutCaching - totalCost
  const savingsPercent = costWithoutCaching > 0 ? ((savings / costWithoutCaching) * 100).toFixed(1) : '0.0'

  console.log(`   Total cost (actual):        $${totalCost.toFixed(6)}`)
  console.log(`   Total cost (no caching):    $${costWithoutCaching.toFixed(6)}`)
  console.log(`   Savings from caching:       $${savings.toFixed(6)} (${savingsPercent}%)`)
  console.log()
  console.log(`   Total input tokens:         ${totalInputTokens}`)
  console.log(`   Total cached tokens:        ${totalCachedTokens}`)
  console.log(`   Overall cache hit rate:     ${overallCacheRate}%`)
  console.log(`   Total output tokens:        ${totalOutputTokens}`)
  console.log()

  // TTFT analysis
  const ttfts = results.filter((r) => r.ttftMs !== undefined).map((r) => r.ttftMs!)
  if (ttfts.length > 0) {
    const avgTtft = ttfts.reduce((a, b) => a + b, 0) / ttfts.length
    const minTtft = Math.min(...ttfts)
    const maxTtft = Math.max(...ttfts)
    console.log(`   TTFT — avg: ${(avgTtft / 1000).toFixed(2)}s, min: ${(minTtft / 1000).toFixed(2)}s, max: ${(maxTtft / 1000).toFixed(2)}s`)

    if (results[0].ttftMs !== undefined && ttfts.length > 1) {
      const coldTtft = results[0].ttftMs
      const warmTtfts = ttfts.slice(1)
      const avgWarmTtft = warmTtfts.reduce((a, b) => a + b, 0) / warmTtfts.length
      console.log(`   TTFT — cold (turn 1): ${(coldTtft / 1000).toFixed(2)}s, avg warm (turns 2-${TURN_PROMPTS.length}): ${(avgWarmTtft / 1000).toFixed(2)}s`)
      if (avgWarmTtft < coldTtft) {
        console.log(`   ✅ Warm TTFT is ${((1 - avgWarmTtft / coldTtft) * 100).toFixed(1)}% faster than cold TTFT`)
      }
    }
  }

  console.log()
  console.log('Done!')
}

main()