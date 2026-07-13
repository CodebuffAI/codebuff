#!/usr/bin/env bun

import { readFileSync } from 'fs'
import { join } from 'path'

import { publishedTools, toolNames } from '@codebuff/common/tools/constants'
import { toolParams } from '@codebuff/common/tools/list'
import { toolMetadata } from '@codebuff/common/tools/metadata'

/**
 * "New tool readiness checklist" — answers the single question we got wrong
 * during the edit_transaction rollout: is this tool actually wired up in EVERY
 * layer, or only some of them?
 *
 * Usage:
 *   bun run scripts/check-tool-registration.ts <tool_name>
 *
 * Exits non-zero if any layer is missing the tool, so it can gate CI / pre-merge
 * before agent prompts are updated to recommend the tool.
 */

const repoRoot = join(import.meta.dir, '..')

interface Check {
  label: string
  ok: boolean
  detail?: string
}

function fileMentions(relativePath: string, needle: string): boolean {
  try {
    return readFileSync(join(repoRoot, relativePath), 'utf8').includes(needle)
  } catch {
    return false
  }
}

function directoryMentions(relativePath: string, needle: string): boolean {
  const root = join(repoRoot, relativePath)
  const visit = (directory: string): boolean => {
    let entries
    try {
      entries = Array.from(
        new Bun.Glob('**/*').scanSync({ cwd: directory, onlyFiles: true }),
      )
    } catch {
      return false
    }
    return entries.some((entry) =>
      fileMentions(join(relativePath, entry), needle),
    )
  }
  return visit(root)
}

export function checkTool(tool: string): Check[] {
  const quoted = `'${tool}'`
  const handlerImport = `./tool/${tool.replace(/_/g, '-')}`

  return [
    {
      label: 'tool name listed in common/src/tools/constants.ts (toolNames)',
      ok: (toolNames as readonly string[]).includes(tool),
    },
    {
      label:
        'params schema registered in common/src/tools/list.ts (toolParams)',
      ok: Object.prototype.hasOwnProperty.call(toolParams, tool),
    },
    {
      label: 'tool is included in the published SDK tool surface',
      ok: (publishedTools as readonly string[]).includes(tool),
    },
    {
      label: 'runtime handler registered in agent-runtime handlers/list.ts',
      ok: fileMentions(
        'packages/agent-runtime/src/tools/handlers/list.ts',
        `${tool}:`,
      ),
      detail: handlerImport,
    },
    {
      label: 'SDK dispatch handles the tool in sdk/src/run.ts',
      ok:
        fileMentions('sdk/src/run.ts', `toolName === '${tool}'`) ||
        fileMentions('sdk/src/run.ts', `toolName === "${tool}"`),
    },
    {
      label: 'generated agent tool type present (agents/types/tools.ts)',
      ok: fileMentions('agents/types/tools.ts', quoted),
    },
    {
      label:
        'initial .agents template tool type present (common/src/templates/initial-agents-dir/types/tools.ts)',
      ok: fileMentions(
        'common/src/templates/initial-agents-dir/types/tools.ts',
        quoted,
      ),
    },
    {
      label: 'CLI generated initial-agent type source contains the tool',
      ok: fileMentions(
        'cli/src/data/initial-agent-type-sources.generated.ts',
        quoted,
      ),
    },
    {
      label: 'CLI renderer metadata classifies the tool',
      ok: Object.prototype.hasOwnProperty.call(toolMetadata, tool),
    },
    {
      label: 'CLI renderer registry enforces metadata dispositions',
      ok:
        fileMentions(
          'cli/src/components/tools/registry.ts',
          'toolRendererDispositions',
        ) &&
        fileMentions(
          'cli/src/components/tools/registry.ts',
          'Missing metadata-declared custom renderer',
        ),
    },
    {
      label: 'documented somewhere under docs/',
      ok: directoryMentions('docs', tool),
    },
  ]
}

function main() {
  const tool = process.argv[2]
  if (!tool) {
    console.error(
      'Usage: bun run scripts/check-tool-registration.ts <tool_name>',
    )
    process.exit(2)
  }

  const checks = checkTool(tool)
  console.log(`Tool readiness check for: ${tool}\n`)
  for (const check of checks) {
    const mark = check.ok ? '✓' : '✗'
    const detail =
      !check.ok && check.detail ? ` (expected ${check.detail})` : ''
    console.log(`  ${mark} ${check.label}${detail}`)
  }

  const missing = checks.filter((check) => !check.ok)
  if (missing.length > 0) {
    console.log(
      `\n${missing.length} layer(s) missing. This tool is NOT ready to recommend in agent prompts.`,
    )
    process.exit(1)
  }

  console.log('\nAll layers present. Tool is consistently registered.')
}

if (import.meta.main) main()
