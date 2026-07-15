import { ApplyPatchComponent } from './apply-patch'
import { CodeSearchComponent } from './code-search'
import { EditTransactionComponent } from './edit-transaction'
import { GlobComponent } from './glob'
import { GitStatusComponent } from './git-status'
import { ListDirectoryComponent } from './list-directory'
import { QueryIndexComponent } from './query-index'
import { ReadDocsComponent } from './read-docs'
import { ReadFilesComponent } from './read-files'
import { ReadSubtreeComponent } from './read-subtree'
import { RenderUIComponent } from './render-ui'
import { RunFileChangeHooksComponent } from './run-file-change-hooks'
import { RunTerminalCommandComponent } from './run-terminal-command'
import { SkillComponent } from './skill'
import { SpawnAgentsComponent } from './spawn-agents'
import { StrReplaceComponent } from './str-replace'
import { SuggestFollowupsComponent } from './suggest-followups'
import { TaskCompleteComponent } from './task-completed'
import { WriteFileComponent } from './write-file'
import { WriteTodosComponent } from './write-todos'
import {
  CheckJobComponent,
  KillJobComponent,
  ReadLogsComponent,
} from './background-job-tools'

import type {
  ToolComponent,
  ToolRenderConfig,
  ToolRenderOptions,
  ToolBlock,
} from './types'
import type { ChatTheme } from '../../types/theme-system'
import type { ToolName } from '@openbuff/sdk'
import { toolMetadata } from '@codebuff/common/tools/metadata'
import { toolNames } from '@codebuff/common/tools/constants'

/**
 * Registry of all tool-specific UI components.
 * Add new tool components here to make them available in the CLI.
 */
const toolComponentRegistry = new Map<ToolName, ToolComponent>([
  [ApplyPatchComponent.toolName, ApplyPatchComponent],
  [CodeSearchComponent.toolName, CodeSearchComponent],
  [GlobComponent.toolName, GlobComponent],
  [GitStatusComponent.toolName, GitStatusComponent],
  [ListDirectoryComponent.toolName, ListDirectoryComponent],
  [QueryIndexComponent.toolName, QueryIndexComponent],
  [RunFileChangeHooksComponent.toolName, RunFileChangeHooksComponent],
  [RunTerminalCommandComponent.toolName, RunTerminalCommandComponent],
  [CheckJobComponent.toolName, CheckJobComponent],
  [ReadLogsComponent.toolName, ReadLogsComponent],
  [KillJobComponent.toolName, KillJobComponent],
  [ReadDocsComponent.toolName, ReadDocsComponent],
  [ReadFilesComponent.toolName, ReadFilesComponent],
  [ReadSubtreeComponent.toolName, ReadSubtreeComponent],
  [RenderUIComponent.toolName, RenderUIComponent],
  [WriteTodosComponent.toolName, WriteTodosComponent],
  [StrReplaceComponent.toolName, StrReplaceComponent],
  [EditTransactionComponent.toolName, EditTransactionComponent],
  [SuggestFollowupsComponent.toolName, SuggestFollowupsComponent],
  [WriteFileComponent.toolName, WriteFileComponent],
  [TaskCompleteComponent.toolName, TaskCompleteComponent],
  ['replace_range', StrReplaceComponent],
  [SkillComponent.toolName, SkillComponent],
  [SpawnAgentsComponent.toolName, SpawnAgentsComponent],
])

/**
 * Register a new tool component.
 * This allows plugins or extensions to add custom tool renderers.
 *
 * @param component - The tool component to register
 */
export function registerToolComponent(component: ToolComponent): void {
  toolComponentRegistry.set(component.toolName, component)
}

/**
 * Get the registered component for a specific tool name.
 *
 * @param toolName - The name of the tool
 * @returns The tool component, or undefined if not registered
 */
export function getToolComponent(
  toolName: ToolName,
): ToolComponent | undefined {
  return toolComponentRegistry.get(toolName)
}

/**
 * Render a tool using its registered component, or return null for default rendering.
 * This is the main entry point for the tool rendering system.
 *
 * @param toolBlock - The tool block to render
 * @param theme - The current chat theme
 * @param options - Rendering options
 * @returns Render configuration, or null to use default rendering
 */
export function renderToolComponent(
  toolBlock: ToolBlock,
  theme: ChatTheme,
  options: ToolRenderOptions,
): ToolRenderConfig | undefined {
  const component = getToolComponent(toolBlock.toolName)

  if (component === undefined) {
    return undefined
  }

  try {
    return component.render(toolBlock as any, theme, options)
  } catch (error) {
    console.error(
      `Error rendering tool component for ${toolBlock.toolName}:`,
      error,
    )
    return undefined
  }
}

/**
 * Get all registered tool names.
 * Useful for debugging or listing available tool renderers.
 */
export function getRegisteredToolNames(): ToolName[] {
  return Array.from(toolComponentRegistry.keys())
}

export type ToolRendererDisposition = 'custom' | 'fallback' | 'hidden'

/** Metadata is the exhaustive source of truth; registration may only enhance fallback. */
export function getToolRendererDisposition(
  toolName: ToolName,
): ToolRendererDisposition {
  const intent = toolMetadata[toolName].renderer
  if (intent === 'hidden') return 'hidden'
  return toolComponentRegistry.has(toolName) ? 'custom' : 'fallback'
}

export const toolRendererDispositions = Object.fromEntries(
  toolNames.map((toolName) => [toolName, getToolRendererDisposition(toolName)]),
) as Record<ToolName, ToolRendererDisposition>

for (const toolName of toolNames) {
  if (
    toolMetadata[toolName].renderer === 'custom' &&
    !toolComponentRegistry.has(toolName)
  ) {
    throw new Error(`Missing metadata-declared custom renderer: ${toolName}`)
  }
}
