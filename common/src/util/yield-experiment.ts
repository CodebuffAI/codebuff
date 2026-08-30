import { fnv1a } from './ad-experiment'

/** Basis-point precision shared by experiment allocation policy. */
export const CPC_YIELD_EXPERIMENT_BASIS_POINTS = 10_000

/**
 * Stable default salt for the CPC yield experiment.
 *
 * This is intentionally distinct from the Imprezia experiment salt. Changing
 * it reassigns every cohort, so published policy should retain it unless a
 * deliberately new experiment is being started.
 */
export const CPC_YIELD_EXPERIMENT_SALT = 'ads_cpc_yield_2026_08_27'

export type CpcYieldExperimentArm = 'control' | 'shadow' | 'treatment'

/**
 * Globally allocated CPC-yield experiment cohorts, all in basis points.
 *
 * `permanentControlBasisPoints` is carved out before the observed cohort and
 * therefore cannot be claimed by shadow or treatment as those allocations
 * grow. Treatment is an inner subset of observed; the rest of observed is
 * shadow.
 */
export interface CpcYieldExperimentConfig {
  observedBasisPoints: number
  treatmentBasisPoints: number
  permanentControlBasisPoints: number
  /** A reviewed policy may supply a non-empty, stable experiment-specific key. */
  cohortSalt?: string
}

/**
 * Reject malformed direct callers rather than accidentally enabling routing.
 * Runtime configuration validates the same contract, but this utility is also
 * used by tests and non-env callers.
 */
export function isValidCpcYieldExperimentConfig(
  config: CpcYieldExperimentConfig | null | undefined,
): boolean {
  if (!config) return false
  const {
    observedBasisPoints,
    treatmentBasisPoints,
    permanentControlBasisPoints,
  } = config
  const basisPoints = [
    observedBasisPoints,
    treatmentBasisPoints,
    permanentControlBasisPoints,
  ]

  if (
    !basisPoints.every(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= CPC_YIELD_EXPERIMENT_BASIS_POINTS,
    )
  ) {
    return false
  }

  if (treatmentBasisPoints > observedBasisPoints) return false
  if (
    permanentControlBasisPoints + observedBasisPoints >
    CPC_YIELD_EXPERIMENT_BASIS_POINTS
  ) {
    return false
  }

  return (
    config.cohortSalt === undefined ||
    (typeof config.cohortSalt === 'string' &&
      config.cohortSalt.trim().length > 0)
  )
}

/**
 * Stable mutually exclusive CPC yield arm for a signed-in user.
 *
 * There is no state or user data stored here: the caller's opaque user id is
 * hashed only long enough to choose a bucket. Invalid policy and absent user
 * identity both fail dark to control.
 */
export function cpcYieldExperimentArmForUser(
  userId: string | null | undefined,
  config: CpcYieldExperimentConfig,
): CpcYieldExperimentArm {
  if (!userId || !isValidCpcYieldExperimentConfig(config)) return 'control'

  const salt = config.cohortSalt ?? CPC_YIELD_EXPERIMENT_SALT
  const bucket = fnv1a(`${salt}:${userId}`) % CPC_YIELD_EXPERIMENT_BASIS_POINTS
  const observedStart = config.permanentControlBasisPoints
  const treatmentEnd = observedStart + config.treatmentBasisPoints
  const observedEnd = observedStart + config.observedBasisPoints

  if (bucket < observedStart || bucket >= observedEnd) return 'control'
  return bucket < treatmentEnd ? 'treatment' : 'shadow'
}
