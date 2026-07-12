import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { evaluateAuditCoverage, inspectCodebaseStructure, inspectFeatureCompleteness } from '../services/audit-intelligence'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-audit-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, 'cli', 'commands'), { recursive: true })
  fs.mkdirSync(path.join(root, 'sdk', 'src', '__tests__'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'bun test' } }))
  fs.writeFileSync(path.join(root, 'cli', 'commands', 'resume-plan.ts'), 'export function resumePlan() { try { return "ready" } catch (error) { return error } }')
  fs.writeFileSync(path.join(root, 'sdk', 'src', 'resume-plan.ts'), 'export const resumePlan = () => "ready"')
  fs.writeFileSync(path.join(root, 'sdk', 'src', '__tests__', 'resume-plan.test.ts'), 'test("resume plan", () => {})')
  fs.writeFileSync(path.join(root, 'README.md'), '# Resume plan\nUse the resume plan command.')
  return root
}

describe('native audit intelligence', () => {
  test('creates a snapshot-bound structural and capability inventory', () => {
    const inventory = inspectCodebaseStructure(fixture())
    expect(inventory.snapshotId).toHaveLength(64)
    expect(inventory.subsystems.map((item) => item.id)).toContain('cli')
    expect(inventory.commands).toContain('cli/commands/resume-plan.ts')
    expect(inventory.capabilityPacket.languages).toContain('typescript')
  })

  test('evaluates vertical feature evidence and blocks uncovered structure', () => {
    const root = fixture()
    const inventory = inspectCodebaseStructure(root)
    const feature = inspectFeatureCompleteness(root, 'resume plan', inventory)
    expect(feature.evidence.implementation.length).toBeGreaterThan(0)
    const blocked = evaluateAuditCoverage({ inventory, structuralReceipts: ['cli'], featureRecords: [feature] })
    expect(blocked.complete).toBe(false)
    expect(blocked.uncoveredSubsystems).toContain('sdk')
  })
})
