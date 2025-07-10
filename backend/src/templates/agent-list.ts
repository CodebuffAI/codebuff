import {
  AgentTemplateType,
  AgentTemplateTypes,
} from '@codebuff/common/types/session-state'

import { models } from '@codebuff/common/constants'
import { agentBuilder } from './agents/agent-builder'
import { dryRun } from './agents/archive/dry-run'
import { ask } from './agents/ask'
import { base } from './agents/base'
import { filePicker } from './agents/file-picker'
import { planner } from './agents/planner'
import { researcher } from './agents/researcher'
import { reviewer } from './agents/reviewer'
import { thinker } from './agents/thinker'
import { thinkingBase } from './agents/thinking-base'
import { AgentTemplate, AgentTemplateUnion } from './types'
import { exampleProgrammatic } from './agents/example-programmatic'

export const agentTemplates: Record<
  AgentTemplateType | string,
  AgentTemplateUnion
> = {
  base: {
    type: AgentTemplateTypes.base,
    ...base(models.openrouter_claude_sonnet_4),
  },
  base_lite: {
    type: AgentTemplateTypes.base_lite,
    ...base(models.gemini2_5_flash),
  },
  base_max: {
    type: AgentTemplateTypes.base_max,
    ...base(models.openrouter_claude_opus_4),
  },
  base_experimental: {
    type: AgentTemplateTypes.base_experimental,
    ...base(models.gemini2_5_pro_preview),
  },
  ask: {
    type: AgentTemplateTypes.ask,
    ...ask(models.gemini2_5_pro_preview),
  },
  claude4_gemini_thinking: {
    type: AgentTemplateTypes.claude4_gemini_thinking,
    ...thinkingBase(models.openrouter_claude_sonnet_4),
  },

  thinker: {
    type: AgentTemplateTypes.thinker,
    ...thinker(models.gemini2_5_pro_preview),
  },
  file_picker: {
    type: AgentTemplateTypes.file_picker,
    ...filePicker(models.gemini2_5_flash),
  },
  researcher: {
    type: AgentTemplateTypes.researcher,
    ...researcher(models.gemini2_5_flash),
  },
  planner: {
    type: AgentTemplateTypes.planner,
    ...planner(models.gemini2_5_pro_preview),
  },
  dry_run: {
    type: AgentTemplateTypes.dry_run,
    ...dryRun(models.gemini2_5_flash),
  },
  reviewer: {
    type: AgentTemplateTypes.reviewer,
    ...reviewer(models.gemini2_5_pro_preview),
  },
  sonnet4_agent_builder: {
    type: AgentTemplateTypes.sonnet4_agent_builder,
    ...agentBuilder(models.openrouter_claude_sonnet_4),
  },
  'example_programmatic': exampleProgrammatic,
}
