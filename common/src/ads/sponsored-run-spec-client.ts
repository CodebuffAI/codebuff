/**
 * The client's check of a sponsored RUN SPEC (`./sponsored-run-spec.ts`).
 *
 * The spec arrives on the funded Accept as parsed JSON from the network, and
 * it decides the prompt, the skill the step driver walks and the only
 * packages the run may install. So a client holds it to what the user
 * consented to before running anything from it, and again when it reads a
 * stored copy back for a resumed turn:
 *
 * - `v` is the version this client sent (`SPONSORED_RUN_SPEC_VERSION`);
 * - `procedure` is the Accept's procedure byte for byte, and
 *   `procedureSha256` is its hash and the one the grant pins;
 * - `skill` is a valid skill that renders exactly that procedure
 *   (`sponsoredSkillMatchesProcedure`), and is present whenever the
 *   procedure names one: a spec never turns a skill run into free text;
 * - `declaredPackages` is a valid package list equal to `skill.packages`, and
 *   empty without a skill;
 * - `promptTemplate` is a bounded string carrying both slots (filled at their
 *   last occurrence by `fillSponsoredRunSpecPrompt`).
 *
 * The one check of a spec: Desktop, the CLI and Cloud all refuse exactly the
 * same specs.
 */

import {
  parseSponsoredDeclaredPackages,
  type SponsoredDeclaredPackage,
} from './sponsored-declared-installs'
import {
  SPONSORED_RUN_SPEC_SLOTS,
  SPONSORED_RUN_SPEC_VERSION,
  type SponsoredRunSpec,
} from './sponsored-run-spec'
import {
  parseSponsoredSkill,
  sponsoredSkillDirective,
  sponsoredSkillMatchesProcedure,
  sponsoredSkillSha256,
} from './sponsored-skill'
import { sha256Hex } from '../util/hash'

/** A template longer than this is not a prompt any server of ours built. */
export const SPONSORED_RUN_SPEC_TEMPLATE_MAX_CHARS = 100_000

export type SponsoredRunSpecCheck =
  | { ok: true; spec: SponsoredRunSpec }
  | { ok: false; reason: string }

function packageKey(pkg: SponsoredDeclaredPackage): string {
  return JSON.stringify([pkg.ecosystem, pkg.name, pkg.version, pkg.dev === true])
}

/**
 * The spec on a funded Accept, held to the procedure the user consented to
 * and the hash the grant pins. `{ ok: false, reason }` names the first
 * mismatch, for the log; never run anything from a refused spec.
 */
export function checkSponsoredRunSpec(
  value: unknown,
  expected: { procedure: string; procedureSha256: string },
): SponsoredRunSpecCheck {
  const refuse = (reason: string): SponsoredRunSpecCheck => ({ ok: false, reason })
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return refuse('not an object')
  }
  const raw = value as Record<string, unknown>
  if (raw.v !== SPONSORED_RUN_SPEC_VERSION) {
    return refuse(`unsupported version ${JSON.stringify(raw.v)}`)
  }
  if (typeof raw.procedure !== 'string' || raw.procedure !== expected.procedure) {
    return refuse('procedure differs from the accepted one')
  }
  const hash = sha256Hex(raw.procedure)
  if (raw.procedureSha256 !== hash || hash !== expected.procedureSha256) {
    return refuse('procedureSha256 differs from the accepted procedure or grant')
  }
  const template = raw.promptTemplate
  if (
    typeof template !== 'string' ||
    template.trim().length === 0 ||
    template.length > SPONSORED_RUN_SPEC_TEMPLATE_MAX_CHARS
  ) {
    return refuse('promptTemplate is missing, empty or too long')
  }
  for (const slot of Object.values(SPONSORED_RUN_SPEC_SLOTS)) {
    if (!template.includes(slot)) {
      return refuse(`promptTemplate is missing the slot ${slot}`)
    }
  }
  let skill: SponsoredRunSpec['skill'] = null
  if (raw.skill != null) {
    const parsed = parseSponsoredSkill(raw.skill)
    if (!parsed.ok) return refuse('skill is not a valid skill')
    if (!sponsoredSkillMatchesProcedure(parsed.skill, raw.procedure)) {
      return refuse('skill does not render the accepted procedure')
    }
    skill = parsed.skill
  } else if (sponsoredSkillDirective(raw.procedure)) {
    return refuse('procedure names a skill and the spec carries none')
  }
  let declaredPackages: SponsoredDeclaredPackage[]
  try {
    declaredPackages = parseSponsoredDeclaredPackages(raw.declaredPackages)
  } catch (error) {
    return refuse(
      `declaredPackages: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const want = (skill?.packages ?? []).map(packageKey).sort()
  const got = declaredPackages.map(packageKey).sort()
  if (want.length !== got.length || want.some((key, i) => key !== got[i])) {
    return refuse(
      skill
        ? "declaredPackages differ from the skill's packages"
        : 'declaredPackages must be empty without a skill',
    )
  }
  return {
    ok: true,
    spec: {
      v: SPONSORED_RUN_SPEC_VERSION,
      procedure: raw.procedure,
      procedureSha256: hash,
      skill,
      declaredPackages,
      promptTemplate: template,
    },
  }
}

/**
 * A spec kept with a run record, read back for a resumed turn: re-checked in
 * full against itself, then held to the procedure hash and skill reference
 * the run recorded at Accept. Untrusted until this passes (a row is a file
 * on disk).
 */
export function storedSponsoredRunSpec(
  value: unknown,
  run: {
    procedureSha256: string
    skill?: { id: string; version: string; sha256: string } | null
  },
): SponsoredRunSpecCheck {
  const procedure =
    value && typeof value === 'object'
      ? (value as { procedure?: unknown }).procedure
      : undefined
  if (typeof procedure !== 'string') {
    return { ok: false, reason: 'stored spec has no procedure' }
  }
  const checked = checkSponsoredRunSpec(value, {
    procedure,
    procedureSha256: run.procedureSha256,
  })
  if (!checked.ok) return checked
  const skill = checked.spec.skill
  const ref = run.skill ?? null
  if (
    (skill === null) !== (ref === null) ||
    (skill &&
      ref &&
      (skill.id !== ref.id ||
        skill.version !== ref.version ||
        sponsoredSkillSha256(skill) !== ref.sha256))
  ) {
    return { ok: false, reason: "stored spec's skill differs from the run's" }
  }
  return checked
}
