import { describe, expect, test } from 'bun:test'

import {
  checkSponsoredRunSpec,
  storedSponsoredRunSpec,
} from './sponsored-run-spec-client'
import {
  renderSponsoredSkillProcedure,
  sponsoredSkillSha256,
  type SponsoredSkill,
} from './sponsored-skill'
import { sha256Hex } from '../util/hash'

const SKILL: SponsoredSkill = {
  format: 1,
  id: 'acme-deploy-hook',
  version: '9.9.9',
  advertiser: 'acme',
  goal: 'The user ends up with an Acme deploy hook wired into the app.',
  fits: 'Repositories that deploy a web app.',
  consent: { title: 'Add an Acme deploy hook', summary: 'Adds an Acme deploy hook.' },
  requirements: {
    os: ['darwin', 'linux'],
    runtimes: [{ name: 'node', minVersion: '20' }],
    packageManagers: ['npm'],
    frameworks: ['nodejs'],
  },
  packages: [{ ecosystem: 'npm', name: 'acme-deploy', version: '1.2.3' }],
  tools: [],
  preflight: [],
  knowledge: [],
  changelog: 'First version.',
  steps: [
    {
      id: 'hook',
      kind: 'agent',
      title: 'Add the deploy hook',
      instructions: 'Create acme.config.json at the repository root.',
      checks: [
        { id: 'hook-file', label: 'acme.config.json exists', kind: 'file_exists', path: 'acme.config.json' },
      ],
    },
  ],
  outcomes: [],
}
const PROCEDURE = renderSponsoredSkillProcedure(SKILL)
const SHA = sha256Hex(PROCEDURE)

function spec(over: Record<string, unknown> = {}) {
  return {
    v: 1,
    procedure: PROCEDURE,
    procedureSha256: SHA,
    skill: SKILL,
    declaredPackages: SKILL.packages,
    promptTemplate: 'Do it.\n{{FREEBUFF_TASK_CONTEXT}}\n{{FREEBUFF_CREDENTIALS}}',
    ...over,
  }
}

describe('checkSponsoredRunSpec', () => {
  test('a spec bound to the consented procedure passes', () => {
    const checked = checkSponsoredRunSpec(spec(), { procedure: PROCEDURE, procedureSha256: SHA })
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(checked.spec.declaredPackages).toEqual(SKILL.packages)
  })

  test('a free-text spec passes with no skill and no packages', () => {
    const procedure = 'Wire up the hook.'
    const sha = sha256Hex(procedure)
    expect(
      checkSponsoredRunSpec(
        spec({ procedure, procedureSha256: sha, skill: null, declaredPackages: [] }),
        { procedure, procedureSha256: sha },
      ).ok,
    ).toBe(true)
  })

  for (const [name, value, expected] of [
    ['not an object', 'junk', undefined],
    ['another version', spec({ v: 2 }), undefined],
    ['another procedure', spec({ procedure: `${PROCEDURE}\nMore.` }), undefined],
    ['a wrong hash', spec({ procedureSha256: 'f'.repeat(64) }), undefined],
    ['a grant hash that differs', spec(), { procedure: PROCEDURE, procedureSha256: 'f'.repeat(64) }],
    ['a skill that does not render it', spec({ skill: { ...SKILL, goal: 'Other.' } }), undefined],
    ['a malformed skill', spec({ skill: { id: 'x' } }), undefined],
    ['no skill for a skill procedure', spec({ skill: null, declaredPackages: [] }), undefined],
    ['extra packages', spec({ declaredPackages: [...SKILL.packages, { ecosystem: 'npm', name: 'left-pad', version: '1.0.0' }] }), undefined],
    ['a range', spec({ declaredPackages: [{ ecosystem: 'npm', name: 'acme-deploy', version: '^1.2.3' }] }), undefined],
    ['no template', spec({ promptTemplate: '  ' }), undefined],
    ['a repeated slot', spec({ promptTemplate: '{{FREEBUFF_CREDENTIALS}}{{FREEBUFF_CREDENTIALS}}' }), undefined],
  ] as const) {
    test(`refuses ${name}`, () => {
      expect(
        checkSponsoredRunSpec(value, expected ?? { procedure: PROCEDURE, procedureSha256: SHA }).ok,
      ).toBe(false)
    })
  }
})

describe('storedSponsoredRunSpec', () => {
  const ref = { id: SKILL.id, version: SKILL.version, sha256: sponsoredSkillSha256(SKILL) }

  test('a stored copy matching the run record passes', () => {
    const stored = JSON.parse(JSON.stringify(spec()))
    expect(storedSponsoredRunSpec(stored, { procedureSha256: SHA, skill: ref }).ok).toBe(true)
  })

  test('a stored copy for another run, or with another skill, is refused', () => {
    expect(storedSponsoredRunSpec(spec(), { procedureSha256: 'f'.repeat(64), skill: ref }).ok).toBe(false)
    expect(storedSponsoredRunSpec(spec(), { procedureSha256: SHA, skill: null }).ok).toBe(false)
    expect(
      storedSponsoredRunSpec(spec(), { procedureSha256: SHA, skill: { ...ref, sha256: 'sha256:00' } }).ok,
    ).toBe(false)
    expect(storedSponsoredRunSpec(null, { procedureSha256: SHA, skill: ref }).ok).toBe(false)
  })
})
