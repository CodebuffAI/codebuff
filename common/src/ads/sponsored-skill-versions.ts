/**
 * How a skill's next version is numbered (docs/ads/agentic/sponsored-skills.md,
 * "Versions"). Shared by the skill improvement loop, which numbers its
 * candidates, and the Agentic Ads Lab, which numbers an admin's edits.
 */

import type { SponsoredSkill } from './sponsored-skill'

export type SkillBump = 'patch' | 'minor' | 'major'

/** Key order is not meaning: a skill read back from jsonb has its keys reordered. */
const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [
              key,
              sorted((value as Record<string, unknown>)[key]),
            ]),
        )
      : value
const same = (a: unknown, b: unknown) =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

/** A check without its label: what decides pass or fail. */
const checkLogic = ({
  label: _label,
  ...check
}: SponsoredSkill['preflight'][number]) => check

/**
 * The bump a change needs. Major: steps added, removed, reordered or
 * re-kinded, a user step or its credential changed, or what the user
 * consents to or needs changed. Minor: a check's logic, a check added or
 * removed, attempts, a package or tool. Patch: everything else (wording,
 * knowledge, labels).
 */
export function requiredSkillBump(
  current: SponsoredSkill,
  next: SponsoredSkill,
): SkillBump {
  const shape = (s: SponsoredSkill) =>
    s.steps.map((step) => [step.id, step.kind])
  const userSteps = (s: SponsoredSkill) =>
    s.steps.filter((step) => step.kind === 'user')
  if (
    !same(shape(current), shape(next)) ||
    !same(userSteps(current), userSteps(next)) ||
    !same(current.consent, next.consent) ||
    !same(current.requirements, next.requirements)
  )
    return 'major'
  const logic = (s: SponsoredSkill) => ({
    preflight: s.preflight.map(checkLogic),
    steps: s.steps.map((step) => [
      step.checks.map(checkLogic),
      step.maxAttempts,
    ]),
    packages: s.packages,
    tools: s.tools,
  })
  return same(logic(current), logic(next)) ? 'patch' : 'minor'
}

export function bumpVersion(version: string, bump: SkillBump): string {
  const [major = 0, minor = 0, patch = 0] = version
    .split('-')[0]!
    .split('.')
    .map(Number)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
