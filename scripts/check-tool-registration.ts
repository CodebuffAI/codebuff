#!/usr/bin/env bun

import { readFileSync } from 'fs'
import { join } from 'path'

import { toolNames } from '@codebuff/common/tools/constants'
import { toolParams } from '@codebuff/common/tools/list'

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

function checkTool(tool: string): Check[] {
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
      label: 'runtime handler registered in agent-runtime handlers/list.ts',
      ok: fileMentions(
        'packages/agent-runtime/src/tools/handlers/list.ts',
        `${tool}:`,
      ),
      detail: handlerImport,
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
      label: 'documented in docs/deterministic-edit-system.md (usage guidance)',
      ok: fileMentions('docs/deterministic-edit-system.md', tool),
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

main()
