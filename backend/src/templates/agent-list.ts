import {
  AgentTemplateType,
  AgentTemplateTypes,
} from '@codebuff/common/types/session-state'

import { models } from '@codebuff/common/constants'
import { agentBuilder } from './agents/agent-builder'
import { dryRun } from './agents/archive/dry-run'
import { ask } from './agents/ask'
import { base } from './agents/base'
import { exampleProgrammatic } from './agents/example-programmatic'
import { filePicker } from './agents/file-picker'
import { planner } from './agents/planner'
import { researcher } from './agents/researcher'
import { reviewer } from './agents/reviewer'
import { thinker } from './agents/thinker'
import { thinkingBase } from './agents/thinking-base'
import { AgentTemplateUnion } from './types'

export const agentTemplates: Record<
  AgentTemplateType | string,
  AgentTemplateUnion
> = {
  base: {
    id: AgentTemplateTypes.base,
    ...base(models.openrouter_claude_sonnet_4),
  },
  base_lite: {
    id: AgentTemplateTypes.base_lite,
    ...base(models.openrouter_kimi_k2),
  },
  base_max: {
    id: AgentTemplateTypes.base_max,
    ...base(models.openrouter_claude_opus_4),
  },
  base_experimental: {
    id: AgentTemplateTypes.base_experimental,
    ...base(models.gemini2_5_pro_preview),
  },
  ask: {
    id: AgentTemplateTypes.ask,
    ...ask(models.gemini2_5_pro_preview),
  },
  claude4_gemini_thinking: {
    id: AgentTemplateTypes.claude4_gemini_thinking,
    ...thinkingBase(models.openrouter_claude_sonnet_4),
  },

  thinker: {
    id: AgentTemplateTypes.thinker,
    ...thinker(models.openrouter_grok_4),
  },
  file_picker: {
    id: AgentTemplateTypes.file_picker,
    ...filePicker(models.gemini2_5_flash),
  },
  researcher: {
    id: AgentTemplateTypes.researcher,
    ...researcher(models.gemini2_5_flash),
  },
  planner: {
    id: AgentTemplateTypes.planner,
    ...planner(models.openrouter_grok_4),
  },
  dry_run: {
    id: AgentTemplateTypes.dry_run,
    ...dryRun(models.gemini2_5_flash),
  },
  reviewer: {
    id: AgentTemplateTypes.reviewer,
    ...reviewer(models.gemini2_5_pro_preview),
  },
  sonnet4_agent_builder: {
    id: AgentTemplateTypes.sonnet4_agent_builder,
    ...agentBuilder(models.openrouter_claude_sonnet_4),
  },
  example_programmatic: exampleProgrammatic,
}
