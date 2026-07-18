import { randomUUID } from 'node:crypto'

import { LocalHarnessStore } from './local-harness-store'

import type { LocalHarnessRecord } from './local-harness-store'

type RecordScope = {
  repositoryId: string
  workspaceId: string
  runId: string
  snapshotId: string
}

export type HarnessApprovalMode = 'balanced' | 'strict' | 'allow-all'

export type ApprovalRecord = LocalHarnessRecord & {
  action: string
  target: string
  grantedBy: 'user'
  expiresAt?: string
  consumedAt?: string
}

export type OwnershipRecord = LocalHarnessRecord & {
  transactionId: string
  agentRole: string
  findingsAddressed: string[]
  requirementsAddressed: string[]
  changes: Array<{
    path: string
    ownership: 'pre-existing' | 'agent' | 'mixed' | 'generated'
    beforeHash?: string
    afterHash?: string
  }>
}

function now(): string {
  return new Date().toISOString()
}

export class HarnessApprovalService {
  constructor(private readonly store: LocalHarnessStore) {}

  grant(
    scope: RecordScope,
    params: { action: string; target: string; expiresAt?: string },
  ): ApprovalRecord {
    const timestamp = now()
    return this.store.put('approvals', {
      schemaVersion: 1,
      id: `approval-${randomUUID()}`,
      revision: 0,
      ...scope,
      createdAt: timestamp,
      updatedAt: timestamp,
      action: params.action,
      target: params.target,
      grantedBy: 'user',
      ...(params.expiresAt ? { expiresAt: params.expiresAt } : {}),
    }) as ApprovalRecord
  }

  consume(params: {
    repositoryId: string
    workspaceId: string
    runId: string
    approvalId: string
    action: string
    target: string
    snapshotId: string
  }): ApprovalRecord {
    const existing = this.store.read(
      params.repositoryId,
      'approvals',
      params.approvalId,
    ) as ApprovalRecord | undefined
    if (!existing) throw new Error('Approval not found.')
    if (existing.consumedAt) throw new Error('Approval was already consumed.')
    if (existing.expiresAt && Date.parse(existing.expiresAt) <= Date.now()) {
      throw new Error('Approval has expired.')
    }
    if (
      existing.action !== params.action ||
      existing.target !== params.target ||
      existing.workspaceId !== params.workspaceId ||
      existing.runId !== params.runId ||
      existing.snapshotId !== params.snapshotId
    ) {
      throw new Error('Approval scope does not match the requested action.')
    }
    return this.store.put(
      'approvals',
      {
        ...existing,
        revision: existing.revision + 1,
        updatedAt: now(),
        consumedAt: now(),
      },
      existing.revision,
    ) as ApprovalRecord
  }
}

export type ClassifiedHarnessAction = {
  action:
    | 'dependency-install'
    | 'commit'
    | 'migration'
    | 'push'
    | 'pull-request'
    | 'release'
    | 'deploy'
    | 'external-network'
    | 'arbitrary-code'
    | 'workspace-delete'
  target: string
  branch?: string
}

export type HarnessApprovalRequest = ClassifiedHarnessAction & {
  reason: string
  risk: 'routine' | 'high'
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

/**
 * Classifies command shapes that cross the local workspace trust boundary.
 * This classifier never grants authority: the terminal permission profile is
 * evaluated first, then a matching snapshot-scoped approval must be consumed.
 */
export function classifyTerminalHarnessAction(
  rawCommand: string,
): ClassifiedHarnessAction | undefined {
  const command = normalizeCommand(rawCommand)
  const push = command.match(/^git\s+push(?:\s+(.+))?$/i)
  if (push) {
    const args =
      push[1]
        ?.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
        ?.map((value) => value.replace(/^["']|["']$/g, '')) ?? []
    const positional = args.filter((value) => !value.startsWith('-'))
    const remote = positional[0]
    const refspec = positional[1]
    const remoteRef = refspec?.includes(':')
      ? refspec.slice(refspec.lastIndexOf(':') + 1)
      : refspec
    const branch =
      remoteRef && !/^(?:HEAD|@\{-?\d+\})$/i.test(remoteRef)
        ? remoteRef.replace(/^\+/, '').replace(/^refs\/heads\//, '')
        : undefined
    const simplePush = args.every(
      (value) =>
        value === '-u' || value === '--set-upstream' || !value.startsWith('-'),
    )
    return {
      action: 'push',
      target: simplePush && remote && branch ? `${remote}/${branch}` : command,
      ...(branch ? { branch } : {}),
    }
  }
  if (/^git\s+commit\b/i.test(command)) {
    return { action: 'commit', target: command }
  }
  if (
    /^git\s+(?:reset\s+--hard|clean\b[\s\S]*-[^\s]*[fd]|checkout\s+--|restore\b)/i.test(
      command,
    )
  ) {
    return { action: 'workspace-delete', target: command }
  }
  if (
    /^gh\s+pr\s+(?:create|merge|close|reopen|ready|review)\b/i.test(command)
  ) {
    return { action: 'pull-request', target: command }
  }
  if (
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update)|pnpm\s+--filter\s+\S+\s+(?:install|add|remove|update)|yarn\s+workspace\s+\S+\s+(?:add|remove|upgrade)|bun\s+--filter\s+\S+\s+(?:install|add|remove|update)|(?:uv|poetry)\s+(?:add|remove|sync|install|update)|pip3?\s+(?:install|uninstall)|cargo\s+(?:add|rm|remove|fetch|update)|go\s+(?:get|mod\s+(?:tidy|download))|dotnet\s+(?:restore|(?:add|remove)\s+package)|(?:bundle|bundler)\s+(?:add|remove|install|update)|composer\s+(?:require|remove|install|update)|swift\s+package\s+(?:resolve|update)|(?:dart|flutter)\s+pub\s+(?:add|remove|get|upgrade)|mix\s+deps\.(?:get|update)|(?:mvn|mvnw|\.\/mvnw)\s+(?:dependency:resolve|dependency:go-offline)|(?:gradle|gradlew|\.\/gradlew)\s+(?:dependencies|buildEnvironment))\b/i.test(
      command,
    )
  ) {
    return { action: 'dependency-install', target: command }
  }
  if (
    /\b(?:prisma\s+migrate|knex\s+migrate|sequelize\s+db:migrate|rails\s+db:migrate|alembic\s+upgrade|flyway\s+migrate|liquibase\s+update)\b/i.test(
      command,
    )
  ) {
    return { action: 'migration', target: command }
  }
  if (
    /^(?:(?:npm|pnpm|yarn|bun)\s+publish|cargo\s+publish|gh\s+release\s+(?:create|delete|edit|upload)|git\s+tag\b)/i.test(
      command,
    )
  ) {
    return { action: 'release', target: command }
  }
  if (
    /^(?:kubectl|helm|terraform|tofu|ansible|aws|gcloud|az|flyctl|vercel|heroku)\b/i.test(
      command,
    ) ||
    /^(?:docker|podman)\s+(?:push|login|run|compose\s+up|system\s+prune)\b/i.test(
      command,
    ) ||
    /^gh\s+(?:workflow\s+run|repo\s+(?:create|delete)|api\b[\s\S]*(?:-X|--method)\s+(?:POST|PUT|PATCH|DELETE))\b/i.test(
      command,
    )
  ) {
    return { action: 'deploy', target: command }
  }
  if (
    /^(?:ssh|scp|sftp|ftp|telnet|nc|ncat)\b/i.test(command) ||
    /^(?:curl|wget)\b[\s\S]*(?:--data(?:-binary)?|-d\b|--form|-F\b|--upload-file|-T\b|--post-data)\b/i.test(
      command,
    )
  ) {
    return { action: 'external-network', target: command }
  }
  if (
    /^(?:(?:node|bun|deno)\s+(?:-e|--eval)|python(?:3)?\s+-c|ruby\s+-e|perl\s+-e)\b/i.test(
      command,
    ) ||
    /^(?:nohup|setsid)\b/i.test(command) ||
    /(?:\$\(|`|&\s*$)/.test(command)
  ) {
    return { action: 'arbitrary-code', target: command }
  }
  const deletion = command.match(
    /^(?:(?:command|exec)\s+)?rm\s+-[^\n]*r[^\n]*\s+(.+)$/i,
  )
  if (deletion) {
    return { action: 'workspace-delete', target: deletion[1].trim() }
  }
  if (
    /^find\b[\s\S]*(?:-delete\b|-exec(?:dir)?\b|-ok(?:dir)?\b)/i.test(command)
  ) {
    return { action: 'workspace-delete', target: command }
  }
  return undefined
}

export class ChangeOwnershipService {
  constructor(private readonly store: LocalHarnessStore) {}

  record(
    scope: RecordScope,
    params: {
      transactionId: string
      agentRole: string
      findingsAddressed: string[]
      requirementsAddressed: string[]
      changes: OwnershipRecord['changes']
    },
  ): OwnershipRecord {
    if (params.changes.length === 0) {
      throw new Error('Ownership receipts require at least one changed path.')
    }
    const paths = new Set<string>()
    for (const change of params.changes) {
      if (!change.path || change.path.includes('..')) {
        throw new Error(`Invalid ownership path '${change.path}'.`)
      }
      if (paths.has(change.path)) {
        throw new Error(`Duplicate ownership path '${change.path}'.`)
      }
      paths.add(change.path)
    }
    const timestamp = now()
    return this.store.put('ownership', {
      schemaVersion: 1,
      id: `ownership-${params.transactionId}`,
      revision: 0,
      ...scope,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...params,
    }) as OwnershipRecord
  }
}

export type HarnessPolicyDecision =
  | { allowed: true; approvalRequired: false }
  | { allowed: false; approvalRequired: boolean; reason: string }

export function evaluateHarnessActionPolicy(params: {
  action: string
  target: string
  defaultBranch?: string
  branch?: string
  hasMatchingApproval: boolean
  approvalMode?: HarnessApprovalMode
}): HarnessPolicyDecision {
  const approvalMode = params.approvalMode ?? 'balanced'
  const highImpact = new Set([
    'migration',
    'release',
    'deploy',
    'external-network',
    'arbitrary-code',
    'workspace-delete',
  ])
  if (
    params.action === 'push' &&
    params.branch &&
    params.defaultBranch === params.branch
  ) {
    if (approvalMode !== 'allow-all' && !params.hasMatchingApproval) {
      return {
        allowed: false,
        approvalRequired: true,
        reason: 'Direct default-branch pushes require explicit user approval.',
      }
    }
  }
  const requiresApproval =
    approvalMode === 'strict' ||
    (approvalMode === 'balanced' && highImpact.has(params.action))
  if (requiresApproval && !params.hasMatchingApproval) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `Action '${params.action}' requires a snapshot-scoped user approval for '${params.target}'.`,
    }
  }
  return { allowed: true, approvalRequired: false }
}
