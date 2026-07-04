import { describe, expect, test } from 'bun:test'

import gitCommitter from '../git-committer/git-committer'

describe('git-committer (M5.2 resurrected)', () => {
  // Shared schema conformance checks (mirrors new-bundled-agents.test.ts)
  test('has correct id', () => {
    expect(gitCommitter.id).toBe('git-committer')
  })

  test('has a display name', () => {
    expect(typeof gitCommitter.displayName).toBe('string')
    expect(gitCommitter.displayName.length).toBeGreaterThan(0)
  })

  test('has a non-empty spawner prompt', () => {
    expect(typeof gitCommitter.spawnerPrompt).toBe('string')
    expect(gitCommitter.spawnerPrompt!.length).toBeGreaterThan(20)
  })

  test('does not include message history', () => {
    expect(gitCommitter.includeMessageHistory).toBe(false)
  })

  test('has last_message output mode', () => {
    expect(gitCommitter.outputMode).toBe('last_message')
  })

  test('has a string prompt input schema', () => {
    expect(gitCommitter.inputSchema?.prompt?.type).toBe('string')
  })

  test('exposes at least one tool', () => {
    expect((gitCommitter.toolNames ?? []).length).toBeGreaterThan(0)
  })

  test('has no spawnable agents (leaf agent)', () => {
    expect(gitCommitter.spawnableAgents ?? []).toEqual([])
  })

  test('has a non-empty system prompt', () => {
    expect(typeof gitCommitter.systemPrompt).toBe('string')
    expect(gitCommitter.systemPrompt!.length).toBeGreaterThan(20)
  })

  test('has a non-empty instructions prompt', () => {
    expect(typeof gitCommitter.instructionsPrompt).toBe('string')
    expect(gitCommitter.instructionsPrompt!.length).toBeGreaterThan(20)
  })

  test('handleSteps is serializable (function* form)', () => {
    if (!gitCommitter.handleSteps) return
    const src = gitCommitter.handleSteps.toString()
    expect(src).toMatch(/^function\*\s*\(/)
    // Must not close over top-level lexical bindings (sandbox-safe).
    expect(() => new Function(`return (${src})`)()).not.toThrow()
  })

  // git-committer specifics
  test('does not specify a model (vestigial for bundled agents)', () => {
    expect(gitCommitter.model).toBeUndefined()
  })

  test('exposes read + terminal + git tools', () => {
    const tools = gitCommitter.toolNames ?? []
    expect(tools).toContain('read_files')
    expect(tools).toContain('run_terminal_command')
    expect(tools).toContain('git_status')
    expect(tools).toContain('git_branch')
  })

  test('does not expose write/edit tools (commit only, no code changes)', () => {
    const tools = gitCommitter.toolNames ?? []
    expect(tools).not.toContain('write_file')
    expect(tools).not.toContain('str_replace')
  })

  test('instructions prompt mentions commit message', () => {
    expect(gitCommitter.instructionsPrompt!.toLowerCase()).toContain(
      'commit message',
    )
  })

  test('instructions prompt says do not push', () => {
    expect(gitCommitter.instructionsPrompt).toMatch(/do not push/i)
  })

  test('instructions prompt does not include an AI-attribution footer', () => {
    expect(gitCommitter.instructionsPrompt).not.toMatch(/Generated with Openbuff/i)
    expect(gitCommitter.instructionsPrompt).not.toMatch(/Co-Authored-By/i)
    expect(gitCommitter.instructionsPrompt).not.toMatch(/🤖/u)
  })

  test('instructions prompt warns about secrets', () => {
    expect(gitCommitter.instructionsPrompt).toMatch(/secrets|\.env|credentials/i)
  })

  // M2 (R3) — git-committer branch capability. `inputSchema.params` is a JSON Schema whose
  // `properties` value can be a boolean-schema (`true`/`false`) per the JSON-Schema spec, so
  // narrow with a type guard before indexing field metadata.
  const branchParams = gitCommitter.inputSchema?.params
  const branchProps =
    branchParams && typeof branchParams === 'object' && 'properties' in branchParams
      ? (branchParams as { properties?: Record<string, { type?: string; default?: unknown }> }).properties
      : undefined

  test('accepts branch_name in inputSchema.params', () => {
    expect(branchProps?.branch_name).toBeDefined()
    expect(branchProps?.branch_name?.type).toBe('string')
  })

  test('accepts branch_switch in inputSchema.params', () => {
    expect(branchProps?.branch_switch).toBeDefined()
    expect(branchProps?.branch_switch?.type).toBe('boolean')
    expect(branchProps?.branch_switch?.default).toBe(true)
  })

  test('instructions prompt mentions branch creation when branch_name is provided', () => {
    expect(gitCommitter.instructionsPrompt).toMatch(/branch_name/i)
    expect(gitCommitter.instructionsPrompt).toMatch(/git_branch/i)
  })

  test('spawnerPrompt mentions branch capability', () => {
    expect(gitCommitter.spawnerPrompt).toMatch(/branch/i)
  })

  test('handleSteps yields git_branch step first when branch_name is provided', () => {
    if (!gitCommitter.handleSteps) return
    const gen = gitCommitter.handleSteps({
      params: { branch_name: 'feat/test-branch' },
    } as unknown as Parameters<NonNullable<typeof gitCommitter.handleSteps>>[0])
    const firstStep = gen.next().value
    expect(firstStep).toMatchObject({
      toolName: 'git_branch',
      input: { branch_name: 'feat/test-branch', switch: true },
    })
  })

  test('handleSteps omits git_branch step when branch_name is not provided', () => {
    if (!gitCommitter.handleSteps) return
    const gen = gitCommitter.handleSteps({
      params: { stage_all: true },
    } as unknown as Parameters<NonNullable<typeof gitCommitter.handleSteps>>[0])
    const firstStep = gen.next().value
    expect(firstStep).not.toMatchObject({ toolName: 'git_branch' })
    expect(firstStep).toMatchObject({ toolName: 'run_terminal_command' })
  })
})
