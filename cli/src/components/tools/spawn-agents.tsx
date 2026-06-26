import { TextAttributes } from '@opentui/core'

import { useTheme } from '../../hooks/use-theme'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for the spawn_agents tool — the reviewer stage. Labels the
 * stage "Review" with the spawned agent types so it is visually distinguishable
 * from the hooks (verification-gate) stage.
 */
export const SpawnAgentsComponent = defineToolComponent({
  toolName: 'spawn_agents',

  render(toolBlock, _theme, _options): ToolRenderConfig {
    const theme = useTheme()
    const input = toolBlock.input as
      | { agents?: Array<{ agent_type?: string; prompt?: string }> }
      | undefined
    const agents = Array.isArray(input?.agents) ? input!.agents : []

    const header = 'Review'
    const body =
      agents
        .map((a) => a?.agent_type)
        .filter((t): t is string => typeof t === 'string')
        .join(', ') || 'agents'

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
