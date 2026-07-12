import { TextAttributes } from '@opentui/core'

import { useTheme } from '../../hooks/use-theme'
import { defineToolComponent } from './types'
import { getToolOutputValues } from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig } from './types'

type HookResult = {
  hookName?: string
  exitCode?: number
  stdout?: string
  stderr?: string
  errorMessage?: string
  validationStatus?: string
  message?: string
  changedFiles?: string[]
}

/**
 * UI component for the run_file_change_hooks tool — the verification gate.
 * Labels the stage "Hooks" so it is visually distinct from generic terminal
 * commands, and surfaces the changed files that triggered the hooks.
 */
export const RunFileChangeHooksComponent = defineToolComponent({
  toolName: 'run_file_change_hooks',

  render(toolBlock, _theme, _options): ToolRenderConfig {
    const theme = useTheme()
    const input = toolBlock.input as { files?: string[] } | undefined
    const files = Array.isArray(input?.files) ? input!.files : []

    const results = getToolOutputValues(toolBlock.outputRaw).flatMap((value) =>
      Array.isArray(value) ? (value as HookResult[]) : [],
    )
    const failed = results.filter(
      (result) =>
        Boolean(result.errorMessage) ||
        (typeof result.exitCode === 'number' && result.exitCode !== 0),
    ).length
    const skipped = results.filter((result) =>
      ['no_hooks_configured', 'hooks_skipped'].includes(
        result.validationStatus ?? '',
      ),
    ).length
    const passed = Math.max(0, results.length - failed - skipped)
    const header =
      results.length === 0
        ? 'Hooks'
        : `Hooks (${passed} passed${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''})`
    const body = files.length > 0 ? files.join(', ') : 'no files'

    const content = (
      <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
            {header}
          </span>
        </text>
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>{body}</span>
        </text>
        {results.map((result, index) => {
          const isFailed =
            Boolean(result.errorMessage) ||
            (typeof result.exitCode === 'number' && result.exitCode !== 0)
          const isSkipped = ['no_hooks_configured', 'hooks_skipped'].includes(
            result.validationStatus ?? '',
          )
          const output = [result.errorMessage, result.stderr, result.stdout]
            .find((value) => typeof value === 'string' && value.trim())
            ?.trim()
            .split('\n')
            .slice(0, 4)
            .join('\n')
          return (
            <box
              key={`${result.hookName ?? 'hook'}-${index}`}
              style={{ flexDirection: 'column' }}
            >
              <text fg={isFailed ? theme.error : theme.muted}>
                {`${isFailed ? '✗' : isSkipped ? '○' : '✓'} ${result.hookName ?? result.message ?? 'hook'}${typeof result.exitCode === 'number' ? ` (exit ${result.exitCode})` : ''}`}
              </text>
              {output ? <text fg={theme.muted}>{output}</text> : null}
            </box>
          )
        })}
      </box>
    )

    return {
      content,
      collapsedPreview: header,
    }
  },
})
