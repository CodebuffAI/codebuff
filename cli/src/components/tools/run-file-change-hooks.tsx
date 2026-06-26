import { TextAttributes } from '@opentui/core'

import { useTheme } from '../../hooks/use-theme'
import { defineToolComponent } from './types'

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

    // Output is the JSON array shape produced by file-change-hooks.ts.
    let header = 'Hooks'
    const body =
      files.length > 0 ? files.join(', ') : 'no files'

    if (toolBlock.output) {
      try {
        const parsed = JSON.parse(toolBlock.output)
        const value = Array.isArray(parsed) ? parsed[0]?.value : parsed
        if (Array.isArray(value)) {
          const first = value[0] as HookResult | undefined
          if (first?.validationStatus) {
            header = first.validationStatus === 'no_hooks_configured'
              ? 'Hooks (none configured)'
              : first.validationStatus === 'hooks_skipped'
                ? 'Hooks (skipped)'
                : 'Hooks'
          }
        }
      } catch {
        // Not JSON yet (still streaming) — fall through to the streaming label.
      }
    }

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
      </box>
    )

    return {
      content,
      collapsedPreview: header,
    }
  },
})
