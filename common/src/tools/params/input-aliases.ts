import z from 'zod/v4'

import { coerceToArray, coerceToObject, parseJsonBounded } from './utils'

import type { $ToolParams, ToolName } from '../constants'

type ToolInputAliasRule = {
  canonical: string
  aliases?: readonly string[]
  coerce?: 'array' | 'object'
  coerceCanonical?: boolean
  when?: { field: string; equals: unknown }
}

const TOOL_INPUT_ALIAS_RULES: Partial<
  Record<ToolName, readonly ToolInputAliasRule[]>
> = {
  ask_user: [
    { canonical: 'questions', aliases: ['question'], coerce: 'array' },
  ],
  browser_logs: [
    {
      canonical: 'paths',
      aliases: ['path'],
      coerce: 'array',
      coerceCanonical: true,
      when: { field: 'type', equals: 'upload' },
    },
  ],
  check_background_agent: [
    { canonical: 'jobId', aliases: ['job_id'] },
    { canonical: 'wait_for', aliases: ['waitFor'] },
    { canonical: 'timeout_seconds', aliases: ['timeoutSeconds'] },
  ],
  check_job: [
    { canonical: 'jobId', aliases: ['job_id'] },
    { canonical: 'wait_for', aliases: ['waitFor'] },
    { canonical: 'timeout_seconds', aliases: ['timeoutSeconds'] },
    { canonical: 'kill_on_timeout', aliases: ['killOnTimeout'] },
  ],
  code_search: [{ canonical: 'maxResults', aliases: ['max_results'] }],
  find_files_matching_content: [
    { canonical: 'maxFiles', aliases: ['max_files'] },
    { canonical: 'groupBySymbol', aliases: ['group_by_symbol'] },
    { canonical: 'timeoutSeconds', aliases: ['timeout_seconds'] },
  ],
  edit_3d_asset: [
    { canonical: 'source_hash', aliases: ['sourceHash'] },
    {
      canonical: 'operations',
      aliases: ['operation'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  edit_transaction: [
    { canonical: 'edits', aliases: ['edit'], coerce: 'array' },
  ],
  evaluate_audit_coverage: [
    {
      canonical: 'structural_receipts',
      aliases: ['structural_receipt', 'structuralReceipts'],
      coerce: 'array',
      coerceCanonical: true,
    },
    {
      canonical: 'features',
      aliases: ['feature'],
      coerce: 'array',
      coerceCanonical: true,
    },
    {
      canonical: 'scope',
      aliases: ['scopes'],
      coerce: 'array',
      coerceCanonical: true,
    },
    {
      canonical: 'out_of_scope',
      aliases: ['outOfScope', 'out_of_scope_item'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  get_affected_tests: [
    {
      canonical: 'files',
      aliases: ['file'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  get_build_targets: [
    {
      canonical: 'files',
      aliases: ['file'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  get_change_review_bundle: [{ canonical: 'max_chars', aliases: ['maxChars'] }],
  git_branch: [
    { canonical: 'branch_name', aliases: ['branchName'] },
    { canonical: 'allow_dirty', aliases: ['allowDirty'] },
  ],
  git_status: [
    { canonical: 'include_diff', aliases: ['includeDiff'] },
    { canonical: 'max_chars', aliases: ['maxChars'] },
  ],
  inspect_codebase_structure: [
    {
      canonical: 'scope',
      aliases: ['scopes'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  inspect_feature_completeness: [
    { canonical: 'snapshot_id', aliases: ['snapshotId'] },
    {
      canonical: 'scope',
      aliases: ['scopes'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  kill_job: [{ canonical: 'jobId', aliases: ['job_id'] }],
  lookup_agent_info: [{ canonical: 'agentId', aliases: ['agent_id'] }],
  query_index: [
    {
      canonical: 'fileTypes',
      aliases: ['fileType', 'file_types', 'file_type'],
      coerce: 'array',
      coerceCanonical: true,
    },
    {
      canonical: 'pathPrefixes',
      aliases: ['pathPrefix', 'path_prefixes', 'path_prefix'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  read_docs: [
    { canonical: 'libraryTitle', aliases: ['library_title'] },
    { canonical: 'max_tokens', aliases: ['maxTokens'] },
  ],
  read_files: [
    { canonical: 'paths', aliases: ['path'], coerce: 'array' },
    {
      canonical: 'ranges',
      aliases: ['range'],
      coerce: 'array',
      coerceCanonical: true,
    },
    {
      canonical: 'symbols',
      aliases: ['symbol'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  read_image: [{ canonical: 'paths', aliases: ['path'], coerce: 'array' }],
  read_logs: [
    { canonical: 'jobId', aliases: ['job_id'] },
    { canonical: 'max_chars', aliases: ['maxChars'] },
  ],
  read_slices: [{ canonical: 'symbols', aliases: ['symbol'], coerce: 'array' }],
  read_subtree: [
    { canonical: 'paths', aliases: ['path'], coerce: 'array' },
    { canonical: 'maxTokens', aliases: ['max_tokens'] },
  ],
  render_3d_preview: [
    {
      canonical: 'views',
      aliases: ['view'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  run_file_change_hooks: [
    {
      canonical: 'files',
      aliases: ['file'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  run_targeted_validation: [
    { canonical: 'snapshot_id', aliases: ['snapshotId'] },
    {
      canonical: 'files',
      aliases: ['file'],
      coerce: 'array',
      coerceCanonical: true,
    },
    {
      canonical: 'artifact_kinds',
      aliases: ['artifact_kind', 'artifactKinds'],
      coerce: 'array',
      coerceCanonical: true,
    },
  ],
  run_terminal_command: [
    { canonical: 'process_type', aliases: ['processType'] },
    { canonical: 'timeout_seconds', aliases: ['timeoutSeconds'] },
    { canonical: 'allowed_paths', aliases: ['allowedPaths'], coerce: 'array' },
    {
      canonical: 'approval_receipt_id',
      aliases: ['approvalReceiptId'],
    },
  ],
  spawn_agents: [{ canonical: 'agents', aliases: ['agent'], coerce: 'array' }],
  spawn_agent_inline: [{ canonical: 'agent_type', aliases: ['agentType'] }],
  str_replace: [
    {
      canonical: 'replacements',
      aliases: ['replacement'],
      coerce: 'array',
    },
  ],
  suggest_followups: [
    { canonical: 'followups', aliases: ['followup'], coerce: 'array' },
  ],
  update_plan_status: [
    { canonical: 'updates', aliases: ['update'], coerce: 'array' },
    { canonical: 'sessionStatus', aliases: ['session_status'] },
    { canonical: 'currentTask', aliases: ['current_task'] },
    { canonical: 'expectedRevision', aliases: ['expected_revision'] },
  ],
  web_search: [
    { canonical: 'include_links', aliases: ['includeLinks'] },
    { canonical: 'max_links', aliases: ['maxLinks'] },
  ],
  write_audit_findings: [
    { canonical: 'sessionSlug', aliases: ['session_slug'] },
    { canonical: 'shardId', aliases: ['shard_id'] },
    { canonical: 'snapshotId', aliases: ['snapshot_id'] },
    {
      canonical: 'findings',
      aliases: ['finding'],
      coerce: 'array',
      coerceCanonical: true,
    },
    { canonical: 'noIssuesFound', aliases: ['no_issues_found'] },
  ],
  write_todos: [{ canonical: 'todos', aliases: ['todo'], coerce: 'array' }],
}

export function normalizeToolInputAliases(
  toolName: ToolName,
  input: unknown,
): unknown {
  const rules = TOOL_INPUT_ALIAS_RULES[toolName]
  if (!rules) return input

  const parsed = parseJsonBounded(input)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parsed
  }

  const original = parsed as Record<string, unknown>
  let normalized = original
  const assign = (key: string, value: unknown) => {
    if (normalized === original) normalized = { ...original }
    normalized[key] = value
  }

  for (const rule of rules) {
    if (rule.when && normalized[rule.when.field] !== rule.when.equals) continue
    let value = normalized[rule.canonical]
    let valueCameFromAlias = false
    if (value === undefined) {
      const alias = rule.aliases?.find(
        (candidate) => normalized[candidate] !== undefined,
      )
      if (alias) {
        value = normalized[alias]
        valueCameFromAlias = true
        assign(rule.canonical, value)
      }
    }

    if (
      (valueCameFromAlias || rule.coerceCanonical) &&
      value !== undefined &&
      rule.coerce === 'array'
    ) {
      // Leave existing arrays untouched so tool-specific preprocessors retain
      // ownership of comma-fragment recovery and its established error shape.
      assign(
        rule.canonical,
        Array.isArray(value) ? value : coerceToArray(value),
      )
    } else if (
      (valueCameFromAlias || rule.coerceCanonical) &&
      value !== undefined &&
      rule.coerce === 'object'
    ) {
      assign(rule.canonical, coerceToObject(value))
    }
  }

  return normalized
}

export function applyToolInputAliases<T extends Record<string, $ToolParams>>(
  params: T,
): T & {
  [K in keyof T]: { providerInputSchema: $ToolParams['inputSchema'] }
} {
  return Object.fromEntries(
    Object.entries(params).map(([name, config]) => {
      const toolName = name as ToolName
      const providerInputSchema =
        config.providerInputSchema ?? config.inputSchema
      if (!TOOL_INPUT_ALIAS_RULES[toolName]) {
        return [name, { ...config, providerInputSchema }]
      }
      return [
        name,
        {
          ...config,
          providerInputSchema,
          inputSchema: z.preprocess(
            (input) => normalizeToolInputAliases(toolName, input),
            config.inputSchema as unknown as z.ZodType,
          ),
        },
      ]
    }),
  ) as T & {
    [K in keyof T]: { providerInputSchema: $ToolParams['inputSchema'] }
  }
}
