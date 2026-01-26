import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for skill tool.
 * Displays the skill name being loaded in a compact format.
 */
export const SkillComponent = defineToolComponent({
  toolName: 'skill',

  render(toolBlock): ToolRenderConfig {
    const input = toolBlock.input as any

    const skillName =
      typeof input?.name === 'string' ? input.name.trim() : ''

    if (!skillName) {
      return { content: null }
    }

    return {
      content: (
        <SimpleToolCallItem name="Load Skill" description={skillName} />
      ),
    }
  },
})
