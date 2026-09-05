import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from '../constants/freebuff-model-ids'

/** Public response shape. The bearer belongs in host memory, never a thread. */
export type SponsoredComputeGrant = Readonly<{
  token: string
  proposalId: string
  runId: string
  procedureSha256: string
  modelId: string
  expiresAtMs: number
  allowanceUsdMicros: number
}>

export type SponsoredComputePolicy = Readonly<{
  modelId: string
  campaignIds: readonly string[]
  allowanceUsdMicros: number
  acceptancePriceCents: number
  ttlMs: number
}>

export type SponsoredComputePolicyEnv = {
  FREEBUFF_SPONSORED_COMPUTE_ENABLED?: string
  FREEBUFF_SPONSORED_COMPUTE_CAMPAIGN_IDS?: string
  FREEBUFF_SPONSORED_COMPUTE_MODEL_ID?: string
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Server configuration only. An absent or incomplete policy admits nothing. */
export function readSponsoredComputePolicy(
  env: SponsoredComputePolicyEnv,
): SponsoredComputePolicy | null {
  if (env.FREEBUFF_SPONSORED_COMPUTE_ENABLED !== 'true') return null
  const modelId = env.FREEBUFF_SPONSORED_COMPUTE_MODEL_ID?.trim()
  const campaigns = env.FREEBUFF_SPONSORED_COMPUTE_CAMPAIGN_IDS?.split(',').map(
    (id) => id.trim(),
  )
  if (
    !modelId ||
    modelId !== FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID ||
    modelId.length > 128 ||
    !/^[a-zA-Z0-9._:/-]+$/.test(modelId) ||
    !campaigns?.length ||
    campaigns.length > 100 ||
    campaigns.some((id) => !UUID.test(id))
  )
    return null
  return Object.freeze({
    modelId,
    campaignIds: Object.freeze([...new Set(campaigns)]),
    // The $2 acceptance fee is the only commercial charge. Compute is an
    // internal, bounded cost of fulfilling that offer, capped here at $0.50.
    allowanceUsdMicros: 500_000,
    acceptancePriceCents: 200,
    ttlMs: 60 * 60_000,
  })
}
