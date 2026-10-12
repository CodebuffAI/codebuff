/**
 * Skills in the Agentic Ads Lab: the skill maker's input, and the versions the
 * Lab keeps. A version is immutable, like a shipped one; an edit is a new
 * version. Shipping a Lab version to campaigns is a reviewed repository change
 * (docs/ads/agentic/sponsored-skills.md), never a Lab action.
 */

import { z } from 'zod/v4'

import {
  SPONSORED_SKILL_FRAMEWORKS,
  renderSponsoredSkillProcedure,
  sponsoredSkillSha256,
  type SponsoredSkill,
} from './sponsored-skill'
import { sha256Hex } from '../util/hash'

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch {
      return false
    }
  }, 'Use an HTTPS URL.')

export const labSkillMakeInputSchema = z
  .object({
    advertiserName: z.string().trim().min(1).max(120),
    websiteUrl: httpsUrl,
    /** The docs site, when it is not under the website. */
    docsUrl: httpsUrl.optional(),
    /** One sentence: what the user ends up with. */
    goal: z.string().trim().min(10).max(600),
    frameworks: z
      .array(z.enum(SPONSORED_SKILL_FRAMEWORKS))
      .min(1)
      .max(SPONSORED_SKILL_FRAMEWORKS.length),
  })
  .strict()
export type LabSkillMakeInput = z.infer<typeof labSkillMakeInputSchema>

/** What the maker read, so a reviewer can check a skill's facts against it. */
export type LabSkillResearch = {
  input: LabSkillMakeInput
  sources: Array<{ url: string; chars: number }>
  /** Version pins the maker corrected against the npm registry, and similar. */
  notes: string[]
  model: string
  costUsd: number
}

export type LabSkillVersion = {
  skillId: string
  version: string
  skill: SponsoredSkill
  /** `sponsoredSkillSha256`: the hash the rendered directive line carries. */
  sha256: string
  /** Hex sha256 of the trimmed rendered procedure: what batches and runs store. */
  procedureSha256: string
  /** `shipped` is in the repository's registry; the rest live in the Lab. */
  origin: 'shipped' | 'maker' | 'edit'
  research: LabSkillResearch | null
  createdBy: string | null
  createdAt: string | null
}

export const labSkillSaveInputSchema = z
  .object({
    /** The skill JSON as edited; validated by `parseSponsoredSkill`. */
    skill: z.record(z.string(), z.unknown()),
  })
  .strict()

export type LabSkillMakeResult =
  | { ok: true; version: LabSkillVersion }
  | {
      ok: false
      /** The last draft, for the admin to fix by hand; null when none parsed. */
      text: string | null
      errors: string[]
      research: LabSkillResearch
    }

/** Hex sha256 of the trimmed rendered procedure, as batches and runs record it. */
export function sponsoredSkillProcedureSha256(skill: SponsoredSkill): string {
  return sha256Hex(renderSponsoredSkillProcedure(skill).trim())
}

export function labSkillVersion(
  skill: SponsoredSkill,
  meta: Pick<
    LabSkillVersion,
    'origin' | 'research' | 'createdBy' | 'createdAt'
  >,
): LabSkillVersion {
  return {
    skillId: skill.id,
    version: skill.version,
    skill,
    sha256: sponsoredSkillSha256(skill),
    procedureSha256: sponsoredSkillProcedureSha256(skill),
    ...meta,
  }
}

/**
 * The repository file that ships a Lab version: `<id>/<version>.ts` under
 * `common/src/ads/sponsored-skills/`, plus the lines to add to `all.ts` and
 * `versions.lock.ts`. Shipping is a reviewed pull request.
 */
export function labSkillModuleSource(skill: SponsoredSkill): {
  path: string
  source: string
  lockLine: string
} {
  const key = `${skill.id}@${skill.version}`
  return {
    path: `common/src/ads/sponsored-skills/${skill.id}/${skill.version}.ts`,
    source: [
      `import type { SponsoredSkill } from '../../sponsored-skill'`,
      '',
      '/**',
      ` * ${key}, made in the Agentic Ads Lab and merged by a reviewer.`,
      ' * Shipped versions are immutable; change it with a new version.',
      ' */',
      `export const skill: SponsoredSkill = ${JSON.stringify(skill, null, 2)}`,
      '',
    ].join('\n'),
    lockLine: `'${key}': '${sponsoredSkillSha256(skill)}',`,
  }
}
