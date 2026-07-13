import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'dependency-manager',
  publisher,
  displayName: 'Dependency Manager',
  spawnerPrompt:
    'Performs a structured dependency add, remove, sync, restore, or update when the user explicitly requested dependency mutation. Select the manager from repository manifests; never pass arbitrary shell.',
  inputSchema: {
    params: {
      type: 'object',
      properties: {
        manager: {
          type: 'string',
          enum: [
            'npm',
            'pnpm',
            'yarn',
            'bun',
            'uv',
            'poetry',
            'pip',
            'cargo',
            'go',
            'dotnet',
            'bundler',
            'composer',
            'swift',
            'dart',
            'flutter',
            'mix',
            'maven',
            'gradle',
          ],
        },
        operation: {
          type: 'string',
          enum: ['add', 'remove', 'sync', 'restore', 'update'],
        },
        packages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact package specifications requested by the user.',
        },
        workspace: { type: 'string' },
        cwd: { type: 'string' },
        timeout_seconds: {
          type: 'number',
          minimum: 1,
          maximum: 1800,
          description:
            'Bounded timeout for each package-manager command. Defaults to 600 seconds.',
        },
      },
      required: ['manager', 'operation'],
    },
  },
  outputMode: 'structured_output',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  programmaticToolNames: ['inspect_environment', 'set_output'],
  terminalPermissionProfile: 'dependency-mutation',
  spawnableAgents: [],
  systemPrompt:
    'You are a deterministic polyglot dependency manager. You construct bounded package-manager commands from structured inputs and never execute arbitrary shell.',
  instructionsPrompt:
    'Use repository environment evidence to confirm the selected manager when possible. Add/remove operations require explicit package names. Sync/restore operations use the existing manifest and lockfile. Do not chain commands, add shell syntax, use global installation, switch package managers, or mutate dependencies merely because validation reported a missing package.',
  handleSteps: function* ({ params }) {
    const manager = String(params?.manager ?? '')
    const operation = String(params?.operation ?? '')
    const rawPackages = Array.isArray(params?.packages) ? params.packages : []
    const packages = rawPackages.filter(
      (value): value is string =>
        typeof value === 'string' &&
        value.trim().length > 0 &&
        !value.trim().startsWith('-') &&
        !/[\0;&|`\r\n]/.test(value),
    )
    const workspace =
      typeof params?.workspace === 'string' ? params.workspace.trim() : ''
    const timeoutSeconds =
      typeof params?.timeout_seconds === 'number' &&
      Number.isFinite(params.timeout_seconds)
        ? Math.max(1, Math.min(1800, Math.floor(params.timeout_seconds)))
        : 600
    const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
    const packageArgs = packages.map(quote).join(' ')
    const emit = (
      status: 'success' | 'failed' | 'unsupported' | 'invalid',
      message: string,
      extra: Record<string, unknown> = {},
    ) => ({
      toolName: 'set_output' as const,
      input: {
        data: {
          schemaVersion: 1,
          status,
          manager,
          operation,
          message,
          ...extra,
        },
      },
    })

    if (rawPackages.length !== packages.length) {
      yield emit(
        'invalid',
        'Package specifications must be non-empty positional arguments and cannot contain shell-control characters or begin with a dash.',
      ) as ToolCall<'set_output'>
      return
    }
    if (workspace.startsWith('-') || /[\0;&|`\r\n]/.test(workspace)) {
      yield emit('invalid', 'The workspace selector is not a safe positional value.') as ToolCall<'set_output'>
      return
    }
    if ((operation === 'add' || operation === 'remove') && packages.length === 0) {
      yield emit(
        'invalid',
        `${operation} requires at least one explicit package specification.`,
      ) as ToolCall<'set_output'>
      return
    }

    const supportedOperations: Record<string, string[]> = {
      npm: ['add', 'remove', 'sync', 'restore', 'update'],
      pnpm: ['add', 'remove', 'sync', 'restore', 'update'],
      yarn: ['add', 'remove', 'sync', 'restore', 'update'],
      bun: ['add', 'remove', 'sync', 'restore', 'update'],
      uv: ['add', 'remove', 'sync', 'restore', 'update'],
      poetry: ['add', 'remove', 'sync', 'restore', 'update'],
      pip: ['add', 'remove'],
      cargo: ['add', 'remove', 'sync', 'restore', 'update'],
      go: ['add', 'sync', 'restore', 'update'],
      dotnet: ['add', 'remove', 'restore'],
      bundler: ['add', 'remove', 'sync', 'restore', 'update'],
      composer: ['add', 'remove', 'sync', 'restore', 'update'],
      swift: ['sync', 'restore', 'update'],
      dart: ['add', 'remove', 'sync', 'restore', 'update'],
      flutter: ['add', 'remove', 'sync', 'restore', 'update'],
      mix: ['sync', 'restore', 'update'],
      maven: ['sync', 'restore'],
      gradle: ['sync', 'restore'],
    }
    if (!supportedOperations[manager]?.includes(operation)) {
      yield emit(
        'unsupported',
        `Manager '${manager}' does not support the structured '${operation}' operation.`,
        { supportedOperations: supportedOperations[manager] ?? [] },
      ) as ToolCall<'set_output'>
      return
    }

    const { toolResult: environmentResult } = yield {
      toolName: 'inspect_environment',
      input: {},
      includeToolCall: false,
    } as ToolCall<'inspect_environment'>
    const environmentValue = environmentResult?.find(
      (part) => part.type === 'json',
    )?.value as Record<string, unknown> | undefined
    const detectedPackageManager =
      typeof environmentValue?.packageManager === 'string'
        ? environmentValue.packageManager
        : undefined
    const manifests = Array.isArray(environmentValue?.manifests)
      ? environmentValue.manifests.filter(
          (value): value is string => typeof value === 'string',
        )
      : []
    const manifestManager = manifests.includes('Cargo.toml')
      ? 'cargo'
      : manifests.includes('go.mod')
        ? 'go'
        : manifests.includes('pom.xml')
          ? 'maven'
          : manifests.some((value) =>
                ['build.gradle', 'build.gradle.kts'].includes(value),
              )
            ? 'gradle'
            : manifests.includes('Package.swift')
              ? 'swift'
              : undefined
    const javascriptManagers = ['npm', 'pnpm', 'yarn', 'bun']
    const detectedManager = javascriptManagers.includes(manager)
      ? detectedPackageManager
      : manifestManager
    if (detectedManager && detectedManager !== manager) {
      yield emit(
        'invalid',
        `Selected manager '${manager}' conflicts with repository evidence for '${detectedManager}'.`,
        { detectedManager, manifests },
      ) as ToolCall<'set_output'>
      return
    }

    const commands: string[] = []
    if (manager === 'npm') {
      const workspaceArg = workspace ? ` -w ${quote(workspace)}` : ''
      commands.push(
        operation === 'add'
          ? `npm install${workspaceArg} ${packageArgs}`
          : operation === 'remove'
            ? `npm remove${workspaceArg} ${packageArgs}`
            : operation === 'update'
              ? `npm update${workspaceArg}${packageArgs ? ` ${packageArgs}` : ''}`
              : `npm install${workspaceArg}`,
      )
    } else if (manager === 'pnpm') {
      const filter = workspace ? ` --filter ${quote(workspace)}` : ''
      const verb =
        operation === 'add'
          ? 'add'
          : operation === 'remove'
            ? 'remove'
            : operation === 'update'
              ? 'update'
              : 'install'
      commands.push(`pnpm${filter} ${verb}${packageArgs ? ` ${packageArgs}` : ''}`)
    } else if (manager === 'yarn') {
      const isWorkspaceOperation = ['add', 'remove', 'update'].includes(operation)
      const prefix =
        workspace && isWorkspaceOperation
          ? `yarn workspace ${quote(workspace)}`
          : 'yarn'
      const verb =
        operation === 'add'
          ? 'add'
          : operation === 'remove'
            ? 'remove'
            : operation === 'update'
              ? 'upgrade'
              : 'install'
      commands.push(`${prefix} ${verb}${packageArgs ? ` ${packageArgs}` : ''}`)
    } else if (manager === 'bun') {
      const filter = workspace ? ` --filter ${quote(workspace)}` : ''
      const verb =
        operation === 'add'
          ? 'add'
          : operation === 'remove'
            ? 'remove'
            : operation === 'update'
              ? 'update'
              : 'install'
      commands.push(`bun${filter} ${verb}${packageArgs ? ` ${packageArgs}` : ''}`)
    } else if (manager === 'uv') {
      commands.push(
        operation === 'add'
          ? `uv add ${packageArgs}`
          : operation === 'remove'
            ? `uv remove ${packageArgs}`
            : operation === 'update'
              ? 'uv sync --upgrade'
              : 'uv sync',
      )
    } else if (manager === 'poetry') {
      commands.push(
        operation === 'add'
          ? `poetry add ${packageArgs}`
          : operation === 'remove'
            ? `poetry remove ${packageArgs}`
            : operation === 'update'
              ? `poetry update${packageArgs ? ` ${packageArgs}` : ''}`
              : operation === 'sync'
                ? 'poetry install --sync'
                : 'poetry install',
      )
    } else if (manager === 'pip') {
      commands.push(
        `pip ${operation === 'add' ? 'install' : 'uninstall -y'} ${packageArgs}`,
      )
    } else if (manager === 'cargo') {
      commands.push(
        operation === 'add'
          ? `cargo add ${packageArgs}`
          : operation === 'remove'
            ? `cargo rm ${packageArgs}`
            : operation === 'update'
              ? `cargo update${packageArgs ? ` ${packageArgs}` : ''}`
              : 'cargo fetch',
      )
    } else if (manager === 'go') {
      commands.push(
        operation === 'add' || operation === 'update'
          ? `go get ${packageArgs}`
          : operation === 'sync'
            ? 'go mod tidy'
            : 'go mod download',
      )
    } else if (manager === 'dotnet') {
      if (operation === 'restore') commands.push('dotnet restore')
      else {
        for (const packageName of packages) {
          commands.push(
            `dotnet ${operation} package ${quote(packageName)}`,
          )
        }
      }
    } else if (manager === 'bundler') {
      const verb =
        operation === 'add'
          ? 'add'
          : operation === 'remove'
            ? 'remove'
            : operation === 'update'
              ? 'update'
              : 'install'
      commands.push(`bundle ${verb}${packageArgs ? ` ${packageArgs}` : ''}`)
    } else if (manager === 'composer') {
      const verb =
        operation === 'add'
          ? 'require'
          : operation === 'remove'
            ? 'remove'
            : operation === 'update'
              ? 'update'
              : 'install'
      commands.push(`composer ${verb}${packageArgs ? ` ${packageArgs}` : ''}`)
    } else if (manager === 'swift') {
      commands.push(`swift package ${operation === 'update' ? 'update' : 'resolve'}`)
    } else if (manager === 'dart' || manager === 'flutter') {
      const verb =
        operation === 'add'
          ? 'add'
          : operation === 'remove'
            ? 'remove'
            : operation === 'update'
              ? 'upgrade'
              : 'get'
      commands.push(`${manager} pub ${verb}${packageArgs ? ` ${packageArgs}` : ''}`)
    } else if (manager === 'mix') {
      commands.push(
        operation === 'update'
          ? `mix deps.update${packageArgs ? ` ${packageArgs}` : ''}`
          : 'mix deps.get',
      )
    } else if (manager === 'maven') {
      commands.push('mvn dependency:resolve')
    } else if (manager === 'gradle') {
      commands.push('./gradlew dependencies')
    }

    const results: Record<string, unknown>[] = []
    for (const command of commands) {
      const { toolResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command,
          cwd: typeof params?.cwd === 'string' ? params.cwd : undefined,
          timeout_seconds: timeoutSeconds,
        },
      } as ToolCall<'run_terminal_command'>
      const resultValue = toolResult?.find((part) => part.type === 'json')
        ?.value as Record<string, unknown> | undefined
      const failed =
        typeof resultValue?.errorMessage === 'string' ||
        (typeof resultValue?.exitCode === 'number' && resultValue.exitCode !== 0)
      results.push({ command, ...(resultValue ?? {}) })
      if (failed) {
        yield emit('failed', `Dependency command failed: ${command}`, {
          detectedManager,
          manifests,
          commands,
          results,
        }) as ToolCall<'set_output'>
        return
      }
    }
    yield emit('success', 'Dependency operation completed successfully.', {
      detectedManager,
      manifests,
      commands,
      results,
    }) as ToolCall<'set_output'>
  },
}

export default definition
