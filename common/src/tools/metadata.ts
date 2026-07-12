import { quarantinedToolNames, toolNames, type ToolName } from './constants'

export type ToolBehaviorKind =
  | 'read'
  | 'mutation'
  | 'proposal'
  | 'control'
  | 'other'
export type ToolSchedulingScope = 'read_only' | 'named_path' | 'global'
export type ToolResultContract =
  | 'legacy_v0'
  | 'read_v1'
  | 'mutation_v1'
  | 'proposal_v1'
export type ToolRendererIntent = 'custom' | 'fallback' | 'hidden'
export type ToolReachability = 'active' | 'quarantined' | 'internal'

export type ToolMetadata = {
  kind: ToolBehaviorKind
  scheduling: ToolSchedulingScope
  pathInputs: readonly string[]
  resultContract: ToolResultContract
  renderer: ToolRendererIntent
  includeInMutationSummary: boolean
  reachability: ToolReachability
  promptVisible: boolean
  deprecated: boolean
}

const READ_TOOLS = new Set<ToolName>([
  'check_job',
  'code_search',
  'find_files',
  'find_files_matching_content',
  'git_status',
  'get_task',
  'get_change_review_bundle',
  'inspect_workspace',
  'inspect_environment',
  'get_affected_tests',
  'get_build_targets',
  'inspect_codebase_structure',
  'inspect_feature_completeness',
  'evaluate_audit_coverage',
  'glob',
  'list_directory',
  'query_index',
  'read_docs',
  'read_files',
  'read_image',
  'read_logs',
  'read_outline',
  'read_slices',
  'read_subtree',
])
const MUTATION_TOOLS = new Set<ToolName>([
  'apply_patch',
  'apply_smart_patch',
  'create_plan',
  'edit_transaction',
  'replace_range',
  'rewrite_symbol',
  'str_replace',
  'update_plan_status',
  'write_file',
])
const EFFECTFUL_VALIDATION_TOOLS = new Set<ToolName>([
  'run_file_change_hooks',
  'run_targeted_validation',
])
const PROPOSAL_TOOLS = new Set<ToolName>([
  'accept_proposal',
  'apply_proposal',
  'propose_edit_transaction',
  'propose_str_replace',
  'propose_write_file',
  'read_proposal_workspace',
  'read_proposals',
  'reject_proposal',
])
const READ_ONLY_PROPOSAL_TOOLS = new Set<ToolName>([
  'read_proposal_workspace',
  'read_proposals',
])
const HIDDEN_TOOLS = new Set<ToolName>([
  'add_message',
  'add_subgoal',
  'end_turn',
  'set_messages',
  'set_output',
  'spawn_agent_inline',
  'task_completed',
  'think_deeply',
  'update_subgoal',
])
const CUSTOM_RENDERERS = new Set<ToolName>([
  'apply_patch',
  'edit_transaction',
  'query_index',
  'read_files',
  'read_subtree',
  'read_proposals',
  'accept_proposal',
  'reject_proposal',
  'apply_proposal',
  'run_file_change_hooks',
  'run_terminal_command',
  'skill',
  'str_replace',
  'suggest_followups',
  'write_todos',
])
const NAMED_PATH_TOOLS = new Set<ToolName>([
  'apply_patch',
  'apply_smart_patch',
  'create_plan',
  'replace_range',
  'rewrite_symbol',
  'str_replace',
  'update_plan_status',
  'write_file',
])
const PATH_INPUTS: Partial<Record<ToolName, readonly string[]>> = {
  apply_patch: ['operation.path'],
  apply_smart_patch: ['path'],
  create_plan: ['path'],
  edit_transaction: ['edits[].path'],
  propose_edit_transaction: ['edits[].path'],
  propose_str_replace: ['path'],
  propose_write_file: ['path'],
  read_files: ['paths[]', 'ranges[].path', 'symbols[].path'],
  read_outline: ['path'],
  read_proposal_workspace: ['paths[]'],
  read_slices: ['path'],
  read_subtree: ['paths[]'],
  replace_range: ['path'],
  rewrite_symbol: ['path'],
  str_replace: ['path'],
  update_plan_status: ['path'],
  write_file: ['path'],
}

const quarantined = new Set<ToolName>(quarantinedToolNames)
const legacyMutationTools = new Set<ToolName>(['update_plan_status'])

function metadataFor(toolName: ToolName): ToolMetadata {
  const kind: ToolBehaviorKind = READ_TOOLS.has(toolName)
    ? 'read'
    : EFFECTFUL_VALIDATION_TOOLS.has(toolName)
      ? 'other'
    : MUTATION_TOOLS.has(toolName)
      ? 'mutation'
      : PROPOSAL_TOOLS.has(toolName)
        ? 'proposal'
        : HIDDEN_TOOLS.has(toolName)
          ? 'control'
          : 'other'
  const reachability: ToolReachability = quarantined.has(toolName)
    ? 'quarantined'
    : HIDDEN_TOOLS.has(toolName)
      ? 'internal'
      : 'active'

  return {
    kind,
    scheduling:
      kind === 'read' || READ_ONLY_PROPOSAL_TOOLS.has(toolName)
        ? 'read_only'
        : NAMED_PATH_TOOLS.has(toolName)
          ? 'named_path'
          : 'global',
    pathInputs: PATH_INPUTS[toolName] ?? [],
    resultContract:
      toolName === 'read_files'
        ? 'read_v1'
        : kind === 'mutation'
          ? legacyMutationTools.has(toolName)
            ? 'legacy_v0'
            : 'mutation_v1'
          : kind === 'proposal'
            ? 'proposal_v1'
            : 'legacy_v0',
    renderer: HIDDEN_TOOLS.has(toolName)
      ? 'hidden'
      : CUSTOM_RENDERERS.has(toolName)
        ? 'custom'
        : 'fallback',
    includeInMutationSummary:
      kind === 'mutation' || toolName === 'apply_proposal',
    reachability,
    promptVisible: reachability === 'active',
    deprecated: toolName === 'read_slices',
  }
}

export const toolMetadata = Object.fromEntries(
  toolNames.map((toolName) => [toolName, metadataFor(toolName)]),
) as Record<ToolName, ToolMetadata>

export function getToolMetadata(toolName: ToolName): ToolMetadata {
  return toolMetadata[toolName]
}
