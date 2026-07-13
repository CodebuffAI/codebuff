import { describe, expect, test } from 'bun:test'

import dependencyManager from '../dependency-manager/dependency-manager'

const environmentResult = (value: Record<string, unknown>) => ({
  toolResult: [{ type: 'json' as const, value: value as never }],
  agentState: {} as never,
  stepsComplete: false,
})

const terminalResult = (value: Record<string, unknown>) => ({
  toolResult: [{ type: 'json' as const, value: value as never }],
  agentState: {} as never,
  stepsComplete: false,
})

describe('dependency-manager', () => {
  test('uses constrained dependency mutation plus hidden environment inspection', () => {
    expect(dependencyManager.terminalPermissionProfile).toBe(
      'dependency-mutation',
    )
    expect(dependencyManager.toolNames).toEqual(['run_terminal_command'])
    expect(dependencyManager.programmaticToolNames).toEqual([
      'inspect_environment',
      'set_output',
    ])
  })

  test.each([
    [
      {
        manager: 'npm',
        operation: 'add',
        packages: ['prom-client'],
        workspace: 'server',
      },
      { packageManager: 'npm', manifests: ['package.json'] },
      "npm install -w 'server' 'prom-client'",
    ],
    [
      {
        manager: 'pnpm',
        operation: 'add',
        packages: ['prom-client'],
        workspace: 'server',
      },
      { packageManager: 'pnpm', manifests: ['package.json'] },
      "pnpm --filter 'server' add 'prom-client'",
    ],
    [
      { manager: 'uv', operation: 'sync' },
      { manifests: ['pyproject.toml'] },
      'uv sync',
    ],
    [
      { manager: 'cargo', operation: 'add', packages: ['serde'] },
      { manifests: ['Cargo.toml'] },
      "cargo add 'serde'",
    ],
    [
      { manager: 'go', operation: 'sync' },
      { manifests: ['go.mod'] },
      'go mod tidy',
    ],
    [
      { manager: 'composer', operation: 'add', packages: ['vendor/pkg'] },
      { manifests: [] },
      "composer require 'vendor/pkg'",
    ],
    [
      { manager: 'swift', operation: 'restore' },
      { manifests: ['Package.swift'] },
      'swift package resolve',
    ],
    [
      { manager: 'flutter', operation: 'add', packages: ['http'] },
      { manifests: [] },
      "flutter pub add 'http'",
    ],
    [
      { manager: 'mix', operation: 'sync' },
      { manifests: [] },
      'mix deps.get',
    ],
    [
      { manager: 'maven', operation: 'restore' },
      { manifests: ['pom.xml'] },
      'mvn dependency:resolve',
    ],
    [
      { manager: 'gradle', operation: 'restore' },
      { manifests: ['build.gradle'] },
      './gradlew dependencies',
    ],
  ])('constructs a bounded command for %o', (params, environment, expected) => {
    const generator = dependencyManager.handleSteps!({
      agentState: {} as never,
      params,
      logger: {} as never,
    })
    expect(generator.next().value).toMatchObject({
      toolName: 'inspect_environment',
    })
    expect(generator.next(environmentResult(environment)).value).toMatchObject({
      toolName: 'run_terminal_command',
      input: { command: expected, timeout_seconds: 600 },
    })
  })

  test('rejects unsupported manager-operation pairs without running a command', () => {
    const generator = dependencyManager.handleSteps!({
      agentState: {} as never,
      params: { manager: 'maven', operation: 'add', packages: ['example'] },
      logger: {} as never,
    })
    expect(generator.next().value).toMatchObject({
      toolName: 'set_output',
      input: {
        data: {
          status: 'unsupported',
          manager: 'maven',
          operation: 'add',
          supportedOperations: ['sync', 'restore'],
        },
      },
    })
  })

  test('rejects package-manager flags disguised as package names', () => {
    const generator = dependencyManager.handleSteps!({
      agentState: {} as never,
      params: {
        manager: 'npm',
        operation: 'add',
        packages: ['--ignore-scripts'],
      },
      logger: {} as never,
    })
    expect(generator.next().value).toMatchObject({
      toolName: 'set_output',
      input: { data: { status: 'invalid' } },
    })
  })

  test('refuses a selected manager that conflicts with repository evidence', () => {
    const generator = dependencyManager.handleSteps!({
      agentState: {} as never,
      params: { manager: 'npm', operation: 'sync' },
      logger: {} as never,
    })
    generator.next()
    expect(
      generator.next(
        environmentResult({
          packageManager: 'pnpm',
          manifests: ['package.json'],
        }),
      ).value,
    ).toMatchObject({
      toolName: 'set_output',
      input: {
        data: { status: 'invalid', detectedManager: 'pnpm' },
      },
    })
  })

  test('does not confuse a JavaScript root manager with a nested non-JavaScript ecosystem', () => {
    const generator = dependencyManager.handleSteps!({
      agentState: {} as never,
      params: { manager: 'cargo', operation: 'sync', cwd: 'crates/core' },
      logger: {} as never,
    })
    generator.next()
    expect(
      generator.next(
        environmentResult({
          packageManager: 'pnpm',
          manifests: ['package.json', 'Cargo.toml'],
        }),
      ).value,
    ).toMatchObject({
      toolName: 'run_terminal_command',
      input: { command: 'cargo fetch', cwd: 'crates/core' },
    })
  })

  test('returns structured failure and honors a bounded timeout', () => {
    const generator = dependencyManager.handleSteps!({
      agentState: {} as never,
      params: {
        manager: 'npm',
        operation: 'sync',
        timeout_seconds: 30,
      },
      logger: {} as never,
    })
    generator.next()
    expect(
      generator.next(
        environmentResult({
          packageManager: 'npm',
          manifests: ['package.json'],
        }),
      ).value,
    ).toMatchObject({
      toolName: 'run_terminal_command',
      input: { timeout_seconds: 30 },
    })
    expect(
      generator.next(
        terminalResult({ exitCode: 1, stderr: 'registry unavailable' }),
      ).value,
    ).toMatchObject({
      toolName: 'set_output',
      input: { data: { status: 'failed' } },
    })
  })

  test('runs one dotnet command per package and reports success', () => {
    const generator = dependencyManager.handleSteps!({
      agentState: {} as never,
      params: {
        manager: 'dotnet',
        operation: 'add',
        packages: ['One', 'Two'],
      },
      logger: {} as never,
    })
    generator.next()
    expect(
      generator.next(environmentResult({ manifests: [] })).value,
    ).toMatchObject({ input: { command: "dotnet add package 'One'" } })
    expect(generator.next(terminalResult({ exitCode: 0 })).value).toMatchObject({
      input: { command: "dotnet add package 'Two'" },
    })
    expect(generator.next(terminalResult({ exitCode: 0 })).value).toMatchObject({
      toolName: 'set_output',
      input: { data: { status: 'success' } },
    })
  })
})
