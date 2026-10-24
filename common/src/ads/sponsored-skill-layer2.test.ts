import { describe, expect, test } from 'bun:test'

import {
  renderSponsoredSkillProcedure,
  sponsoredSkillSha256,
  sponsoredSkillTrackedLink,
} from './sponsored-skill'
import {
  buildLayer2Skill,
  compileLayer2Skill,
  isLayer2Skill,
  LAYER2_SKILL_CHANGELOG,
  type SponsoredSkillLayer2,
} from './sponsored-skill-layer2'
import { parseSponsoredProcedureSteps } from './sponsored-procedure-steps'

const SIGNUP =
  'https://app.posthog.com/signup?utm_source=freebuff&utm_medium=cpc&utm_campaign=analytics&bfcid={bfcid}'

const base: SponsoredSkillLayer2 = {
  id: 'posthog-product-analytics',
  advertiser: 'posthog',
  goal: 'Add PostHog capture for 2–4 events that answer one product question.',
  docsUrl: 'https://posthog.com/docs/libraries/js',
  signupUrl: SIGNUP,
  packages: [{ ecosystem: 'npm', name: 'posthog-js', version: '1.438.13' }],
  consent: {
    title: 'Measure one product journey with PostHog',
    summary: 'Adds 2–4 events for one product question. Nothing is deployed.',
  },
}

describe('buildLayer2Skill', () => {
  test('an npm skill with no keys compiles to a parsing format-2 skill', () => {
    const result = buildLayer2Skill(base, '1.0.0')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { skill } = result
    expect(skill.format).toBe(2)
    expect(skill.fit).toEqual({
      routes: { node: {} },
      mustNotExist: ['**/yarn.lock'],
    })
    expect(skill.requirements.frameworks).toEqual(['nodejs'])
    expect(skill.steps.map((step) => step.kind)).toEqual(['agent', 'user'])
    expect(skill.outcomes).toEqual([])
    expect(sponsoredSkillTrackedLink(skill)).toBe(SIGNUP)
    expect(isLayer2Skill(skill)).toBe(true)
  })

  test('env keys become secure credential steps on the signup link', () => {
    const result = buildLayer2Skill(
      { ...base, envKeys: ['POSTHOG_PROJECT_TOKEN'] },
      '1.0.0',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const user = result.skill.steps[1]!
    expect(user.credential).toEqual({
      env: 'POSTHOG_PROJECT_TOKEN',
      label: 'Posthog project token',
      getUrl: SIGNUP,
    })
    expect(user.checks[0]!.kind).toBe('credential_provided')
    expect(result.skill.outcomes).toEqual(['api_key_issued'])
    const agentChecks = result.skill.steps[0]!.checks.map((check) => check.kind)
    expect(agentChecks).toContain('env_key_declared')
    expect(sponsoredSkillTrackedLink(result.skill)).toBe(SIGNUP)
  })

  test('a pypi skill gets a python route and a manifest check', () => {
    const result = buildLayer2Skill(
      {
        ...base,
        packages: [{ ecosystem: 'pypi', name: 'posthog', version: '3.7.0' }],
      },
      '1.0.0',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skill.fit).toEqual({ routes: { python: {} } })
    expect(result.skill.requirements.frameworks).toEqual([])
    const check = result.skill.steps[0]!.checks[0]!
    expect(check.kind).toBe('file_contains')
  })

  test('a mixed skill has no package checks, so neither project fails one', () => {
    const result = buildLayer2Skill(
      {
        ...base,
        packages: [
          { ecosystem: 'npm', name: 'posthog-node', version: '4.2.1' },
          { ecosystem: 'pypi', name: 'posthog', version: '3.7.0' },
        ],
      },
      '1.0.0',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const kinds = result.skill.steps[0]!.checks.map((check) => check.kind)
    expect(kinds).toEqual(['no_privileged_secrets'])
  })

  test('the rendered steps read as agent then user work', () => {
    const result = buildLayer2Skill(base, '1.0.0')
    if (!result.ok) throw new Error('expected ok')
    const steps = parseSponsoredProcedureSteps(
      renderSponsoredSkillProcedure(result.skill),
    )
    expect(steps.map((step) => step.needsUser)).toEqual([false, true])
  })

  test('a signup link without bfcid is refused', () => {
    const result = buildLayer2Skill(
      { ...base, signupUrl: 'https://app.posthog.com/signup' },
      '1.0.0',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]!.path).toBe('signupUrl')
  })

  test('a platform or non-secret env key is refused', () => {
    for (const key of ['OPENAI_API_KEY', 'POSTHOG_HOST']) {
      const result = buildLayer2Skill({ ...base, envKeys: [key] }, '1.0.0')
      expect(result.ok).toBe(false)
    }
  })

  test('a range version is refused', () => {
    const result = buildLayer2Skill(
      {
        ...base,
        packages: [{ ecosystem: 'npm', name: 'posthog-js', version: '^1.0.0' }],
      },
      '1.0.0',
    )
    expect(result.ok).toBe(false)
  })

  test('a goal that reads as user work fails the step parser', () => {
    const result = buildLayer2Skill(
      { ...base, goal: 'Ask the user to sign up for PostHog and add events.' },
      '1.0.0',
    )
    expect(result.ok).toBe(false)
  })

  test('unknown fields are refused', () => {
    const result = buildLayer2Skill({ ...base, verify: [] }, '1.0.0')
    expect(result.ok).toBe(false)
  })
})

describe('compileLayer2Skill', () => {
  test('is deterministic: same source and version, same hash', () => {
    const a = sponsoredSkillSha256(compileLayer2Skill(base, '1.0.0'))
    const b = sponsoredSkillSha256(
      compileLayer2Skill(structuredClone(base), '1.0.0'),
    )
    expect(a).toBe(b)
  })

  test('the hash moves with the version and with any field', () => {
    const a = sponsoredSkillSha256(compileLayer2Skill(base, '1.0.0'))
    expect(sponsoredSkillSha256(compileLayer2Skill(base, '1.0.1'))).not.toBe(a)
    expect(
      sponsoredSkillSha256(
        compileLayer2Skill(
          { ...base, docsUrl: 'https://posthog.com/docs' },
          '1.0.0',
        ),
      ),
    ).not.toBe(a)
  })

  test('emits nothing optional as empty or null', () => {
    const skill = compileLayer2Skill(base, '1.0.0')
    expect(JSON.stringify(skill)).not.toContain('null')
    expect('desktop' in skill).toBe(false)
    expect('conversion' in skill).toBe(false)
    expect(skill.changelog).toBe(LAYER2_SKILL_CHANGELOG)
  })

  test('renders far under the old long-form skills', () => {
    const rendered = renderSponsoredSkillProcedure(
      compileLayer2Skill({ ...base, envKeys: ['POSTHOG_PROJECT_TOKEN'] }, '1.0.0'),
    )
    expect(rendered.length).toBeLessThan(2_500)
  })
})
