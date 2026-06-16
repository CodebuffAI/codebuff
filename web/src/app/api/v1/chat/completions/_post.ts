import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { BYOK_OPENROUTER_HEADER } from '@codebuff/common/constants/byok'
import {
  type FreebuffAccessTier,
  FREEBUFF_FORCE_LIMITED_MODE,
  FREEBUFF_GEMINI_PRO_MODEL_ID,
  isFreebuffModelAllowedForAccessTier,
  isFreebuffPremiumModelId,
  isFreebuffTracedModelId,
  isSupportedFreebuffModelId,
} from '@codebuff/common/constants/freebuff-models'
import {
  isFreebuffGeminiThinkerAgent,
  isFreebuffRootAgent,
  isFreeMode,
  isFreeModeAllowedAgentModel,
} from '@codebuff/common/constants/free-agents'
import { getErrorObject } from '@codebuff/common/util/error'
import { formatFreebuffHardBlockedMessage } from '@codebuff/common/util/freebuff-privacy'
import { pluralize } from '@codebuff/common/util/string'
import { env } from '@codebuff/internal/env'
import { NextResponse } from 'next/server'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  InsertChatCompletionTraceBigqueryFn,
  InsertMessageBigqueryFn,
} from '@codebuff/common/types/contracts/bigquery'
import type { GetUserUsageDataFn } from '@codebuff/common/types/contracts/billing'
import type {
  GetAgentRunFromIdFn,
  GetUserInfoFromApiKeyFn,
} from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'

import type { BlockGrantResult } from '@codebuff/billing/subscription'
import {
  isWeeklyLimitError,
  isBlockExhaustedError,
} from '@codebuff/billing/subscription'

export type GetUserPreferencesFn = (params: {
  userId: string
  logger: Logger
}) => Promise<{ fallbackToALaCarte: boolean }>
import type { NextRequest } from 'next/server'

import type { ChatCompletionRequestBody } from '@/llm-api/types'

import { recordChatCompletionTrace } from '@/llm-api/chat-completion-trace'
import { createRequestAuditRecord } from '@/llm-api/helpers'
import { normalizeToolSchemas } from '@/llm-api/tool-schema'
import {
  CanopyWaveError,
  handleCanopyWaveNonStream,
  handleCanopyWaveStream,
  isCanopyWaveModel,
} from '@/llm-api/canopywave'
import {
  FireworksError,
  handleFireworksNonStream,
  handleFireworksStream,
  isFireworksModel,
} from '@/llm-api/fireworks'
import {
  DeepSeekError,
  handleDeepSeekNonStream,
  handleDeepSeekStream,
  isDeepSeekModel,
} from '@/llm-api/deepseek'
import {
  handleMiMoNonStream,
  handleMiMoStream,
  isMiMoModel,
  MiMoError,
} from '@/llm-api/mimo'
import {
  handleMiniMaxNonStream,
  handleMiniMaxStream,
  isMiniMaxModel,
  MiniMaxError,
} from '@/llm-api/minimax'
import {
  handleMoonshotNonStream,
  handleMoonshotStream,
  isMoonshotModel,
  MoonshotError,
} from '@/llm-api/moonshot'
import {
  OpenCodeZenError,
  handleOpenCodeZenNonStream,
  handleOpenCodeZenStream,
  isOpenCodeZenModel,
} from '@/llm-api/opencode-zen'
import {
  SiliconFlowError,
  handleSiliconFlowNonStream,
  handleSiliconFlowStream,
  isSiliconFlowModel,
} from '@/llm-api/siliconflow'
import {
  handleOpenAINonStream,
  handleOpenAIStream,
  isOpenAIDirectModel,
  OpenAIError,
} from '@/llm-api/openai'
import {
  handleOpenRouterNonStream,
  handleOpenRouterStream,
  OpenRouterError,
} from '@/llm-api/openrouter'
import {
  checkSessionAdmissible,
  endUserSession,
} from '@/server/free-session/public-api'
import { getCachedFreeModeCountryAccess } from '@/server/free-mode-country-access-cache'
import {
  getFreeModeAccessTier,
  getFreeModePrivacyDecision,
  getFreeModePrivacyProviderDecision,
  getFreeModeRiskScore,
  shouldHardBlockFreeModeAccess,
} from '@/server/free-mode-country'
import { isFreebuffWebServiceUser } from '@/server/freebuff-web-service-account'

import type { SessionGateResult } from '@/server/free-session/public-api'
import type {
  FreeModeCountryAccess,
  FreeModeCountryAccessOptions,
} from '@/server/free-mode-country'
import { extractApiKeyFromHeader } from '@/util/auth'
import { withDefaultProperties } from '@codebuff/common/analytics'
import {
  checkConfiguredFreeModeRateLimit,
  type RateLimitResult,
} from './free-mode-rate-limiter'
import { beginChatCompletionRequestMetrics } from './request-metrics'

export const formatQuotaResetCountdown = (
  nextQuotaReset: string | null | undefined,
): string => {
  if (!nextQuotaReset) {
    return 'soon'
  }

  const resetDate = new Date(nextQuotaReset)
  if (Number.isNaN(resetDate.getTime())) {
    return 'soon'
  }

  const now = Date.now()
  const diffMs = resetDate.getTime() - now
  if (diffMs <= 0) {
    return 'soon'
  }

  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  const days = Math.floor(diffMs / dayMs)
  if (days > 0) {
    return `in ${pluralize(days, 'day')}`
  }

  const hours = Math.floor(diffMs / hourMs)
  if (hours > 0) {
    return `in ${pluralize(hours, 'hour')}`
  }

  const minutes = Math.max(1, Math.floor(diffMs / minuteMs))
  return `in ${pluralize(minutes, 'minute')}`
}

export type CheckSessionAdmissibleFn = typeof checkSessionAdmissible
export type EndUserSessionFn = typeof endUserSession
export type CheckFreeModeRateLimitFn = (
  userId: string,
  options?: { premium?: boolean },
) => RateLimitResult | Promise<RateLimitResult>
export type ResolveFreeModeCountryAccessFn = (
  userId: string,
  req: NextRequest,
  options: FreeModeCountryAccessOptions,
) => Promise<FreeModeCountryAccess>
export type RecordFreebuffUsageDayFn = (params: {
  userId: string
}) => Promise<void>
export type IsFreebuffWebServiceUserFn = (userId: string) => boolean

const FREEBUFF_SUCCESS_SAMPLE_RATE = 0.01
const SILICONFLOW_DIRECT_ROUTING_ENABLED = false

type ChatCompletionsProvider =
  | 'siliconflow'
  | 'opencodeZen'
  | 'moonshot'
  | 'canopywave'
  | 'deepseek'
  | 'mimo'
  | 'minimax'
  | 'fireworks'
  | 'openai'
  | 'openrouter'

function getChatCompletionsProvider(model: string): ChatCompletionsProvider {
  if (SILICONFLOW_DIRECT_ROUTING_ENABLED && isSiliconFlowModel(model)) {
    return 'siliconflow'
  }
  if (isOpenCodeZenModel(model)) return 'opencodeZen'
  if (isMoonshotModel(model)) return 'moonshot'
  if (isCanopyWaveModel(model)) return 'canopywave'
  if (isDeepSeekModel(model)) return 'deepseek'
  if (isMiMoModel(model)) return 'mimo'
  if (isMiniMaxModel(model)) return 'minimax'
  if (isFireworksModel(model)) return 'fireworks'
  if (isOpenAIDirectModel(model)) return 'openai'
  return 'openrouter'
}

const defaultCheckFreeModeRateLimit: CheckFreeModeRateLimitFn = (
  userId,
  options,
) =>
  checkConfiguredFreeModeRateLimit(userId, {
    redisUrl: env.REDIS_URL,
    premium: options?.premium,
  })

/** Marker present in the freebuff CLI's root-orchestrator system prompt (see
 *  agents/base2/base2.ts → createBase2: "You are Buffy, ..."). Scripted callers
 *  hitting the raw endpoint won't reproduce it, so we use it to reject (not ban)
 *  free-mode root requests that bypass the CLI. Matched case-insensitively. */
const FREEBUFF_SYSTEM_PROMPT_MARKER = 'you are buffy'

/** True when any system message in the request contains the freebuff CLI
 *  orchestrator marker. Handles both string and content-part array shapes. */
function requestHasFreebuffSystemMarker(
  body: ChatCompletionRequestBody,
): boolean {
  const messages = Array.isArray(body.messages) ? body.messages : []
  for (const message of messages) {
    if (!message || message.role !== 'system') continue
    const content = message.content
    let text = ''
    if (typeof content === 'string') {
      text = content
    } else if (Array.isArray(content)) {
      text = content
        .map((part) =>
          part && typeof part === 'object' && 'text' in part
            ? ((part as { text?: string }).text ?? '')
            : '',
        )
        .join(' ')
    }
    if (text.toLowerCase().includes(FREEBUFF_SYSTEM_PROMPT_MARKER)) {
      return true
    }
  }
  return false
}

function sampleSuccessLogger(logger: Logger, sampled: boolean): Logger {
  if (sampled) return logger
  return {
    ...logger,
    info: (() => {}) as Logger['info'],
    debug: (() => {}) as Logger['debug'],
  }
}

type GateRejectCode = Extract<SessionGateResult, { ok: false }>['code']

const STATUS_BY_GATE_CODE = {
  waiting_room_required: 428,
  waiting_room_queued: 429,
  session_superseded: 409,
  session_expired: 410,
  session_model_mismatch: 409,
  freebuff_update_required: 426,
} satisfies Record<GateRejectCode, number>

function getHardBlockedFreeModeMessage(
  countryAccess: Pick<FreeModeCountryAccess, 'ipPrivacy'>,
): string {
  return formatFreebuffHardBlockedMessage(countryAccess.ipPrivacy?.signals)
}

export async function postChatCompletions(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  getUserUsageData: GetUserUsageDataFn
  getAgentRunFromId: GetAgentRunFromIdFn
  fetch: typeof globalThis.fetch
  insertMessageBigquery: InsertMessageBigqueryFn
  insertChatCompletionTraceBigquery?: InsertChatCompletionTraceBigqueryFn
  ensureSubscriberBlockGrant?: (params: {
    userId: string
    logger: Logger
  }) => Promise<BlockGrantResult | null>
  getUserPreferences?: GetUserPreferencesFn
  /** Optional override for the freebuff waiting-room gate. Defaults to the
   *  real check backed by Postgres; tests inject a no-op. */
  checkSessionAdmissible?: CheckSessionAdmissibleFn
  /** Optional override for the free-mode rate limiter. Tests inject this to
   *  avoid coupling to process-global limiter state. */
  checkFreeModeRateLimit?: CheckFreeModeRateLimitFn
  /** Optional override for country/cache checks. Tests inject this to avoid
   *  coupling to Postgres-backed cache state. */
  resolveFreeModeCountryAccess?: ResolveFreeModeCountryAccessFn
  /** Optional override for releasing stale waiting-room rows on hard blocks. */
  endFreebuffSession?: EndUserSessionFn
  /** Optional recorder for successful freebuff chat-completion ingress. */
  recordFreebuffUsageDay?: RecordFreebuffUsageDayFn
  /** Optional service-account resolver. Tests inject this to avoid relying on
   *  process environment. */
  isFreebuffWebServiceUser?: IsFreebuffWebServiceUserFn
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    getUserUsageData,
    getAgentRunFromId,
    fetch,
    insertMessageBigquery,
    insertChatCompletionTraceBigquery,
    ensureSubscriberBlockGrant,
    getUserPreferences,
    checkSessionAdmissible: checkSession = checkSessionAdmissible,
    checkFreeModeRateLimit = defaultCheckFreeModeRateLimit,
    resolveFreeModeCountryAccess,
    endFreebuffSession = endUserSession,
    recordFreebuffUsageDay,
    isFreebuffWebServiceUser:
      resolveIsFreebuffWebServiceUser = isFreebuffWebServiceUser,
  } = params
  let { logger } = params
  let { trackEvent } = params
  const resolveCountryAccess: ResolveFreeModeCountryAccessFn =
    resolveFreeModeCountryAccess ??
    ((userId, req, options) =>
      getCachedFreeModeCountryAccess({ userId, req, options, logger }))

  try {
    // Parse request body
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch (error) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId: 'unknown',
        properties: {
          error: 'Invalid JSON in request body',
        },
        logger,
      })
      return NextResponse.json(
        { message: 'Invalid JSON in request body' },
        { status: 400 },
      )
    }

    const typedBody = normalizeToolSchemas(
      body as unknown as ChatCompletionRequestBody,
    )
    const bodyStream = typedBody.stream ?? false
    const runId = typedBody.codebuff_metadata?.run_id

    // Check if the request is in FREE mode (costs 0 credits for allowed agent+model combos)
    const costMode = typedBody.codebuff_metadata?.cost_mode
    const isFreeModeRequest = isFreeMode(costMode)
    const sampleFreebuffSuccess =
      !isFreeModeRequest || Math.random() < FREEBUFF_SUCCESS_SAMPLE_RATE

    const trackSuccessEvent: TrackEventFn = (eventParams) => {
      if (sampleFreebuffSuccess) {
        trackEvent(eventParams)
      }
    }

    trackEvent = withDefaultProperties(trackEvent, {
      freebuff: isFreeModeRequest,
    })

    // Extract and validate API key
    const apiKey = extractApiKeyFromHeader(req)
    if (!apiKey) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_AUTH_ERROR,
        userId: 'unknown',
        properties: {
          reason: 'Missing API key',
        },
        logger,
      })
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Get user info
    const userInfo = await getUserInfoFromApiKey({
      apiKey,
      fields: ['id', 'email', 'discord_id', 'stripe_customer_id', 'banned'],
      logger,
    })
    if (!userInfo) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_AUTH_ERROR,
        userId: 'unknown',
        properties: {
          reason: 'Invalid API key',
        },
        logger,
      })
      return NextResponse.json(
        { message: 'Invalid Codebuff API key' },
        { status: 401 },
      )
    }
    logger = loggerWithContext({ userInfo })

    const userId = userInfo.id
    const stripeCustomerId = userInfo.stripe_customer_id ?? null
    const isUnmeteredServiceRequest = resolveIsFreebuffWebServiceUser(userId)
    let freebuffAccessTier: FreebuffAccessTier = 'full'

    if (isUnmeteredServiceRequest) {
      logger.info(
        { userId },
        'Processing unmetered Freebuff Web service-account request',
      )
    }

    // Check if user is banned.
    // We use a clear, helpful message rather than a cryptic error because:
    // 1. Legitimate users banned by mistake deserve to know what's happening
    // 2. Bad actors will figure out they're banned regardless of the message
    // 3. Clear messaging encourages resolution (matches our dispute notification email)
    // 4. 403 Forbidden is the correct HTTP status for "you're not allowed"
    if (userInfo.banned) {
      return NextResponse.json(
        {
          error: 'account_suspended',
          message: `Your account has been suspended. Please contact ${env.NEXT_PUBLIC_SUPPORT_EMAIL} if you did not expect this.`,
        },
        { status: 403 },
      )
    }

    // For free mode requests, classify the request into full or limited
    // access. Most non-allowlist/privacy cases, including VPN/proxy traffic,
    // are limited to the cheaper limited-model path; Cloudflare Tor remains a
    // hard block.
    if (isFreeModeRequest) {
      const countryAccess = await resolveCountryAccess(userId, req, {
        fetch,
        ipinfoToken: env.IPINFO_TOKEN,
        spurToken: env.SPUR_TOKEN,
        scamalyticsApiKey: env.SCAMALYTICS_API_KEY,
        ipHashSecret: env.NEXTAUTH_SECRET,
        allowLocalhost: env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev',
        forceLimited: FREEBUFF_FORCE_LIMITED_MODE,
      })
      freebuffAccessTier = getFreeModeAccessTier(countryAccess)
      const hardBlocked = shouldHardBlockFreeModeAccess(countryAccess)
      const privacyDecision = getFreeModePrivacyDecision(countryAccess)
      const privacyProviderDecision =
        getFreeModePrivacyProviderDecision(countryAccess)
      const privacyRiskScore = getFreeModeRiskScore(countryAccess)

      if (!countryAccess.allowed || sampleFreebuffSuccess) {
        logger.info(
          {
            cfHeader: countryAccess.cfCountry,
            geoipResult: countryAccess.geoipCountry,
            resolvedCountry: countryAccess.countryCode,
            countryBlockReason: countryAccess.blockReason,
            ipPrivacySignals: countryAccess.ipPrivacy?.signals,
            spurIpPrivacySignals: countryAccess.spurIpPrivacy?.signals,
            spurStatus: countryAccess.spurStatus,
            scamalyticsIpPrivacySignals:
              countryAccess.scamalyticsIpPrivacy?.signals,
            scamalyticsStatus: countryAccess.scamalyticsStatus,
            scamalyticsScore: countryAccess.scamalyticsScore,
            scamalyticsRisk: countryAccess.scamalyticsRisk,
            privacyRiskScore,
            privacyDecision,
            privacyProviderDecision,
            privacyHardBlocked: hardBlocked,
            clientIp: countryAccess.hasClientIp ? '[redacted]' : undefined,
          },
          'Free mode country detection',
        )
      }

      if (hardBlocked) {
        const error = 'free_mode_unavailable'
        const message = getHardBlockedFreeModeMessage(countryAccess)
        await endFreebuffSession({
          userId,
          userEmail: userInfo.email ?? null,
        })
        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
          userId,
          properties: {
            error,
            countryCode: countryAccess.countryCode,
            countryBlockReason: countryAccess.blockReason,
            ipPrivacySignals: countryAccess.ipPrivacy?.signals,
            spurIpPrivacySignals: countryAccess.spurIpPrivacy?.signals,
            spurStatus: countryAccess.spurStatus,
            scamalyticsIpPrivacySignals:
              countryAccess.scamalyticsIpPrivacy?.signals,
            scamalyticsStatus: countryAccess.scamalyticsStatus,
            scamalyticsScore: countryAccess.scamalyticsScore,
            scamalyticsRisk: countryAccess.scamalyticsRisk,
            privacyRiskScore,
            privacyDecision,
            privacyProviderDecision,
            privacyHardBlocked: hardBlocked,
            clientIp: countryAccess.hasClientIp ? '[redacted]' : undefined,
            accessStatus: 'blocked',
          },
          logger,
        })
        return NextResponse.json(
          {
            error,
            message,
            countryCode: countryAccess.countryCode ?? 'UNKNOWN',
            countryBlockReason: countryAccess.blockReason ?? undefined,
            ipPrivacySignals: countryAccess.ipPrivacy?.signals ?? undefined,
          },
          { status: 403 },
        )
      }

      trackEvent = withDefaultProperties(trackEvent, {
        accessTier: freebuffAccessTier,
        accessStatus: freebuffAccessTier,
        privacyDecision,
        privacyProviderDecision,
        privacyHardBlocked: hardBlocked,
        privacyRiskScore,
        spurStatus: countryAccess.spurStatus,
        scamalyticsStatus: countryAccess.scamalyticsStatus,
      })

      if (!countryAccess.allowed) {
        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
          userId,
          properties: {
            error: 'free_mode_not_available_in_country',
            countryCode: countryAccess.countryCode,
            countryBlockReason: countryAccess.blockReason,
            ipPrivacySignals: countryAccess.ipPrivacy?.signals,
            spurIpPrivacySignals: countryAccess.spurIpPrivacy?.signals,
            spurStatus: countryAccess.spurStatus,
            scamalyticsIpPrivacySignals:
              countryAccess.scamalyticsIpPrivacy?.signals,
            scamalyticsStatus: countryAccess.scamalyticsStatus,
            scamalyticsScore: countryAccess.scamalyticsScore,
            scamalyticsRisk: countryAccess.scamalyticsRisk,
            privacyRiskScore,
            privacyDecision,
            privacyProviderDecision,
            privacyHardBlocked: hardBlocked,
            clientIp: countryAccess.hasClientIp ? '[redacted]' : undefined,
          },
          logger,
        })
      }
    }

    // Track API request. Freebuff success-path analytics are sampled to keep
    // high-volume free traffic from dominating PostHog and log forwarding.
    trackSuccessEvent({
      event: AnalyticsEvent.CHAT_COMPLETIONS_REQUEST,
      userId,
      properties: {
        hasStream: !!bodyStream,
        hasRunId: !!runId,
        userInfo,
      },
      logger,
    })

    // Extract and validate agent run ID
    const runIdFromBody = typedBody.codebuff_metadata?.run_id
    if (!runIdFromBody || typeof runIdFromBody !== 'string') {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'Missing or invalid run_id',
        },
        logger,
      })
      return NextResponse.json(
        { message: 'No runId found in request body' },
        { status: 400 },
      )
    }

    // Get and validate agent run
    const agentRun = await getAgentRunFromId({
      runId: runIdFromBody,
      userId,
      fields: ['agent_id', 'ancestor_run_ids', 'status'],
    })
    if (!agentRun) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'Agent run not found',
          runId: runIdFromBody,
        },
        logger,
      })
      return NextResponse.json(
        { message: `runId Not Found: ${runIdFromBody}` },
        { status: 400 },
      )
    }

    const {
      agent_id: agentId,
      ancestor_run_ids: ancestorRunIds,
      status: agentRunStatus,
    } = agentRun

    if (agentRunStatus !== 'running') {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'Agent run not running',
          runId: runIdFromBody,
          status: agentRunStatus,
        },
        logger,
      })
      return NextResponse.json(
        { message: `runId Not Running: ${runIdFromBody}` },
        { status: 400 },
      )
    }

    // Free-mode requests must use an allowlisted agent+model combination.
    // Without this gate, an attacker on a brand-new unpaid account can set
    // cost_mode='free' to bypass both the paid-account check and the balance
    // check, then request an expensive model (Opus, etc). Our OpenRouter key
    // pays for the call; the downstream credit-consumption step records an
    // audit row but can't actually deduct from a user who has no grants —
    // net result is free Opus for the attacker, real dollars for us. Check
    // must happen here, before any call to OpenRouter.
    if (
      isFreeModeRequest &&
      !isFreeModeAllowedAgentModel(agentId, typedBody.model)
    ) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'free_mode_invalid_agent_model',
          agentId,
          model: typedBody.model,
        },
        logger,
      })
      return NextResponse.json(
        {
          error: 'free_mode_invalid_agent_model',
          message:
            'Free mode is only available for specific agent and model combinations.',
        },
        { status: 403 },
      )
    }

    // Free-mode root requests must carry the real freebuff CLI system prompt
    // (starts with "You are Buffy"). Scripted callers hitting the raw endpoint
    // won't have it, so reject — but do NOT ban — with a friendly nudge to use
    // the CLI. Honest users self-correct; abusers learn the behavior is
    // detectable. Scoped to root agents because subagents (file-picker,
    // code-reviewer, browser-use, …) legitimately use other prompts; non-root
    // free agents are constrained by the hierarchy gate below instead. A caller
    // that injects the marker but still produces no agent steps is then a clear
    // ban candidate (see scripts/find-freebuff-api-suspects.ts).
    if (
      isFreeModeRequest &&
      isFreebuffRootAgent(agentId) &&
      !requestHasFreebuffSystemMarker(typedBody)
    ) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'free_mode_cli_required',
          agentId,
          model: typedBody.model,
        },
        logger,
      })
      return NextResponse.json(
        {
          error: 'free_mode_cli_required',
          message:
            'Free mode is only available through the freebuff CLI. Install it with `npm i -g freebuff`, then run `freebuff`. Calling the API directly is not supported and may get your account banned.',
        },
        { status: 403 },
      )
    }

    if (isFreeModeRequest && !isFreebuffRootAgent(agentId)) {
      const rootRunId = ancestorRunIds[0]
      const rootRun = rootRunId
        ? await getAgentRunFromId({
            runId: rootRunId,
            userId,
            fields: ['agent_id', 'status'],
          })
        : null
      if (
        !rootRun ||
        rootRun.status !== 'running' ||
        !isFreebuffRootAgent(rootRun.agent_id)
      ) {
        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
          userId,
          properties: {
            error: 'free_mode_invalid_agent_hierarchy',
            agentId,
            runId: runIdFromBody,
            rootRunId,
          },
          logger,
        })
        return NextResponse.json(
          {
            error: 'free_mode_invalid_agent_hierarchy',
            message:
              'Free mode subagents must run under an active freebuff session root.',
          },
          { status: 403 },
        )
      }
    }

    if (
      isFreeModeRequest &&
      freebuffAccessTier === 'limited' &&
      (isSupportedFreebuffModelId(typedBody.model) ||
        typedBody.model === FREEBUFF_GEMINI_PRO_MODEL_ID) &&
      !isFreebuffModelAllowedForAccessTier(typedBody.model, freebuffAccessTier)
    ) {
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
        userId,
        properties: {
          error: 'session_model_mismatch',
          model: typedBody.model,
          accessTier: freebuffAccessTier,
        },
        logger,
      })
      return NextResponse.json(
        {
          error: 'session_model_mismatch',
          message:
            'Limited free access is only available with DeepSeek V4 Flash or MiMo 2.5.',
        },
        { status: STATUS_BY_GATE_CODE.session_model_mismatch },
      )
    }

    let freeModeSessionGate: SessionGateResult | null = null

    // Freebuff waiting-room gate. Usually enforced only when
    // FREEBUFF_WAITING_ROOM_ENABLED=true. Runs before the rate limiter so
    // rejected requests don't burn a queued user's free-mode counters.
    if (isFreeModeRequest) {
      const claimedInstanceId =
        typedBody.codebuff_metadata?.freebuff_instance_id
      freeModeSessionGate = await checkSession({
        userId,
        accessTier: freebuffAccessTier,
        userEmail: userInfo.email,
        claimedInstanceId,
        requestedModel: typedBody.model,
        requireActiveSession: isFreebuffGeminiThinkerAgent(agentId),
      })
      if (!freeModeSessionGate.ok) {
        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
          userId,
          properties: { error: freeModeSessionGate.code },
          logger,
        })
        return NextResponse.json(
          {
            error: freeModeSessionGate.code,
            message: freeModeSessionGate.message,
          },
          { status: STATUS_BY_GATE_CODE[freeModeSessionGate.code] },
        )
      }
    }

    // Rate limit free mode requests (after validation so invalid requests don't consume quota).
    // Premium models additionally enforce FREE_MODE_PREMIUM_RATE_LIMITS, so direct
    // endpoint callers can't exceed the intended premium allowance by skipping the
    // agent-run path where the per-session premium cap is normally checked.
    if (isFreeModeRequest) {
      const rateLimitResult = await checkFreeModeRateLimit(userId, {
        premium: isFreebuffPremiumModelId(typedBody.model),
      })
      if (rateLimitResult.limited) {
        const retryAfterSeconds = Math.ceil(rateLimitResult.retryAfterMs / 1000)
        const resetTime = new Date(
          Date.now() + rateLimitResult.retryAfterMs,
        ).toISOString()
        const resetCountdown = formatQuotaResetCountdown(resetTime)

        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_VALIDATION_ERROR,
          userId,
          properties: {
            error: 'free_mode_rate_limited',
            windowName: rateLimitResult.windowName,
            retryAfterSeconds,
          },
          logger,
        })

        const isPremiumWindow =
          rateLimitResult.windowName.startsWith('premium ')
        const message = isPremiumWindow
          ? `Daily free premium-model limit reached. Switch to a standard model (e.g. DeepSeek V4 Flash or MiniMax) or try again ${resetCountdown}.`
          : `Free mode rate limit exceeded (${rateLimitResult.windowName} limit). Try again ${resetCountdown}.`

        return NextResponse.json(
          {
            error: 'free_mode_rate_limited',
            message,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(retryAfterSeconds) },
          },
        )
      }
    }

    // For subscribers, ensure a block grant exists before processing the request.
    // This is done AFTER validation so malformed requests don't start a new 5-hour block.
    // When the function is provided, always include subscription credits in the balance:
    // error/null results mean subscription grants have 0 balance, so including them is harmless.
    const includeSubscriptionCredits =
      !isFreeModeRequest &&
      !isUnmeteredServiceRequest &&
      !!ensureSubscriberBlockGrant
    if (
      !isFreeModeRequest &&
      !isUnmeteredServiceRequest &&
      ensureSubscriberBlockGrant
    ) {
      try {
        const blockGrantResult = await ensureSubscriberBlockGrant({
          userId,
          logger,
        })

        // Check if user hit subscription limit and should be rate-limited
        if (
          blockGrantResult &&
          (isWeeklyLimitError(blockGrantResult) ||
            isBlockExhaustedError(blockGrantResult))
        ) {
          // Fetch user's preference for falling back to a-la-carte credits
          const preferences = getUserPreferences
            ? await getUserPreferences({ userId, logger })
            : { fallbackToALaCarte: true } // Default to allowing a-la-carte if no preference function

          if (!preferences.fallbackToALaCarte) {
            const resetTime = blockGrantResult.resetsAt
            const resetCountdown = formatQuotaResetCountdown(
              resetTime.toISOString(),
            )
            const limitType = isWeeklyLimitError(blockGrantResult)
              ? 'weekly'
              : '5-hour session'

            trackEvent({
              event: AnalyticsEvent.CHAT_COMPLETIONS_INSUFFICIENT_CREDITS,
              userId,
              properties: {
                reason: 'subscription_limit_no_fallback',
                limitType,
                fallbackToALaCarte: false,
              },
              logger,
            })

            return NextResponse.json(
              {
                error: 'rate_limit_exceeded',
                message: `Subscription ${limitType} limit reached. Your limit resets ${resetCountdown}. Enable "Continue with credits" in the CLI to use a-la-carte credits.`,
              },
              { status: 429 },
            )
          }
          // If fallbackToALaCarte is true, continue to use a-la-carte credits
          logger.info(
            {
              userId,
              limitType: isWeeklyLimitError(blockGrantResult)
                ? 'weekly'
                : 'session',
            },
            'Subscriber hit limit, falling back to a-la-carte credits',
          )
        }
      } catch (error) {
        logger.error(
          { error: getErrorObject(error), userId },
          'Error ensuring subscription block grant',
        )
        // Fail open: proceed with subscription credits included in balance check
      }
    }

    // Free-mode requests have already passed their model/session/rate gates
    // and should not touch paid billing/usage paths.
    if (!isFreeModeRequest && !isUnmeteredServiceRequest) {
      // Fetch user credit data (includes subscription credits when block grant was ensured)
      const {
        balance: { totalRemaining },
        nextQuotaReset,
      } = await getUserUsageData({ userId, logger, includeSubscriptionCredits })

      // Credit check
      if (totalRemaining <= 0) {
        trackEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_INSUFFICIENT_CREDITS,
          userId,
          properties: {
            totalRemaining,
            nextQuotaReset,
          },
          logger,
        })
        return NextResponse.json(
          {
            message: `Out of credits. Please add credits at ${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/usage.`,
          },
          { status: 402 },
        )
      }
    }

    if (isFreeModeRequest && recordFreebuffUsageDay) {
      try {
        await recordFreebuffUsageDay({ userId })
      } catch (error) {
        logger.error(
          { error: getErrorObject(error), userId },
          'Failed to record freebuff usage day',
        )
      }
    }

    const openrouterApiKey = req.headers.get(BYOK_OPENROUTER_HEADER)
    const providerLogger = sampleSuccessLogger(logger, sampleFreebuffSuccess)

    // In free mode we only store traces for the whitelisted models that
    // disclose data collection (the DeepSeek family); other free models (e.g.
    // MiniMax M3 on Fireworks, Kimi, MiMo) are not captured. Paid requests are
    // unaffected and always traced.
    if (!isFreeModeRequest || isFreebuffTracedModelId(typedBody.model)) {
      recordChatCompletionTrace({
        body: typedBody,
        userId,
        agentId,
        ancestorRunIds,
        logger: providerLogger,
        insertChatCompletionTraceBigquery,
      })
    }

    const requestMetrics = beginChatCompletionRequestMetrics({
      logger,
      userId,
      agentId,
      runId: runIdFromBody,
      model: typedBody.model,
      streaming: bodyStream,
      costMode,
    })

    // Handle streaming vs non-streaming
    try {
      if (bodyStream) {
        // Streaming request — route supported models to direct providers.
        const provider = getChatCompletionsProvider(typedBody.model)
        const baseArgs = {
          body: typedBody,
          userId,
          stripeCustomerId,
          agentId,
          fetch,
          logger: providerLogger,
          insertMessageBigquery,
        }
        const stream =
          provider === 'siliconflow'
            ? await handleSiliconFlowStream(baseArgs)
            : provider === 'opencodeZen'
              ? await handleOpenCodeZenStream(baseArgs)
              : provider === 'moonshot'
                ? await handleMoonshotStream(baseArgs)
                : provider === 'canopywave'
                  ? await handleCanopyWaveStream(baseArgs)
                  : provider === 'deepseek'
                    ? await handleDeepSeekStream(baseArgs)
                    : provider === 'mimo'
                      ? await handleMiMoStream(baseArgs)
                      : provider === 'minimax'
                        ? await handleMiniMaxStream(baseArgs)
                        : provider === 'fireworks'
                          ? await handleFireworksStream(baseArgs)
                          : provider === 'openai'
                            ? await handleOpenAIStream(baseArgs)
                            : await handleOpenRouterStream({
                                ...baseArgs,
                                openrouterApiKey,
                              })

        trackSuccessEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_STREAM_STARTED,
          userId,
          properties: {
            agentId,
            runId: runIdFromBody,
          },
          logger,
        })

        return new NextResponse(requestMetrics.wrapStream(stream), {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        })
      } else {
        // Non-streaming request — route to direct providers for supported models
        const provider = getChatCompletionsProvider(typedBody.model)

        const baseArgs = {
          body: typedBody,
          userId,
          stripeCustomerId,
          agentId,
          fetch,
          logger: providerLogger,
          insertMessageBigquery,
        }
        const nonStreamRequest =
          provider === 'siliconflow'
            ? handleSiliconFlowNonStream(baseArgs)
            : provider === 'opencodeZen'
              ? handleOpenCodeZenNonStream(baseArgs)
              : provider === 'moonshot'
                ? handleMoonshotNonStream(baseArgs)
                : provider === 'canopywave'
                  ? handleCanopyWaveNonStream(baseArgs)
                  : provider === 'deepseek'
                    ? handleDeepSeekNonStream(baseArgs)
                    : provider === 'mimo'
                      ? handleMiMoNonStream(baseArgs)
                      : provider === 'minimax'
                        ? handleMiniMaxNonStream(baseArgs)
                        : provider === 'fireworks'
                          ? handleFireworksNonStream(baseArgs)
                          : provider === 'openai'
                            ? handleOpenAINonStream(baseArgs)
                            : handleOpenRouterNonStream({
                                ...baseArgs,
                                openrouterApiKey,
                              })
        const result = await nonStreamRequest

        trackSuccessEvent({
          event: AnalyticsEvent.CHAT_COMPLETIONS_GENERATION_STARTED,
          userId,
          properties: {
            agentId,
            runId: runIdFromBody,
            streaming: false,
          },
          logger,
        })

        requestMetrics.end('completed')
        return NextResponse.json(result)
      }
    } catch (error) {
      requestMetrics.end('error', { error: getErrorObject(error) })
      let openrouterError: OpenRouterError | undefined
      if (error instanceof OpenRouterError) {
        openrouterError = error
      }
      let fireworksError: FireworksError | undefined
      if (error instanceof FireworksError) {
        fireworksError = error
      }
      let canopywaveError: CanopyWaveError | undefined
      if (error instanceof CanopyWaveError) {
        canopywaveError = error
      }
      let deepseekError: DeepSeekError | undefined
      if (error instanceof DeepSeekError) {
        deepseekError = error
      }
      let mimoError: MiMoError | undefined
      if (error instanceof MiMoError) {
        mimoError = error
      }
      let minimaxError: MiniMaxError | undefined
      if (error instanceof MiniMaxError) {
        minimaxError = error
      }
      let moonshotError: MoonshotError | undefined
      if (error instanceof MoonshotError) {
        moonshotError = error
      }
      let siliconflowError: SiliconFlowError | undefined
      if (error instanceof SiliconFlowError) {
        siliconflowError = error
      }
      let openaiError: OpenAIError | undefined
      if (error instanceof OpenAIError) {
        openaiError = error
      }
      let opencodeZenError: OpenCodeZenError | undefined
      if (error instanceof OpenCodeZenError) {
        opencodeZenError = error
      }

      // Log detailed error information for debugging
      const errorDetails = openrouterError?.toJSON()
      const telemetryBody = createRequestAuditRecord(body)
      const providerLabel = siliconflowError
        ? 'SiliconFlow'
        : opencodeZenError
          ? 'OpenCode Zen'
          : moonshotError
            ? 'Moonshot'
            : canopywaveError
              ? 'CanopyWave'
              : deepseekError
                ? 'DeepSeek'
                : mimoError
                  ? 'MiMo'
                  : minimaxError
                    ? 'MiniMax'
                    : fireworksError
                      ? 'Fireworks'
                      : openaiError
                        ? 'OpenAI'
                        : 'OpenRouter'
      logger.error(
        {
          error: getErrorObject(error),
          userId,
          agentId,
          runId: runIdFromBody,
          model: typedBody.model,
          streaming: !!bodyStream,
          hasByokKey: !!openrouterApiKey,
          messageCount: Array.isArray(typedBody.messages)
            ? typedBody.messages.length
            : 0,
          messagesOmitted: true,
          accessTier: freebuffAccessTier,
          providerStatusCode: (
            openrouterError ??
            fireworksError ??
            moonshotError ??
            canopywaveError ??
            deepseekError ??
            mimoError ??
            minimaxError ??
            siliconflowError ??
            openaiError ??
            opencodeZenError
          )?.statusCode,
          providerStatusText: (
            openrouterError ??
            fireworksError ??
            moonshotError ??
            canopywaveError ??
            deepseekError ??
            mimoError ??
            minimaxError ??
            siliconflowError ??
            openaiError ??
            opencodeZenError
          )?.statusText,
          openrouterErrorCode: errorDetails?.error?.code,
          openrouterErrorType: errorDetails?.error?.type,
          openrouterErrorMessage: errorDetails?.error?.message,
          openrouterProviderName: errorDetails?.error?.metadata?.provider_name,
          openrouterProviderRaw: errorDetails?.error?.metadata?.raw,
        },
        `${providerLabel} request failed`,
      )
      trackEvent({
        event: AnalyticsEvent.CHAT_COMPLETIONS_ERROR,
        userId,
        properties: {
          error: error instanceof Error ? error.message : 'Unknown error',
          body: telemetryBody,
          agentId,
          streaming: bodyStream,
        },
        logger,
      })

      // Pass through provider-specific errors
      if (error instanceof OpenRouterError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof FireworksError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof MoonshotError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof CanopyWaveError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof DeepSeekError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof MiMoError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof MiniMaxError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof SiliconFlowError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof OpenAIError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }
      if (error instanceof OpenCodeZenError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode })
      }

      return NextResponse.json(
        { error: 'Failed to process request' },
        { status: 500 },
      )
    }
  } catch (error) {
    logger.error(
      getErrorObject(error),
      'Error processing chat completions request',
    )
    trackEvent({
      event: AnalyticsEvent.CHAT_COMPLETIONS_ERROR,
      userId: 'unknown',
      properties: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      logger,
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
