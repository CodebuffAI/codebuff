import { models } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'

import { dryRun } from './agents/archive/dry-run'
import { ask } from './agents/ask'
import { base } from './agents/base'
import { fileExplorer } from './agents/file-explorer'
import { filePicker } from './agents/file-picker'
import { planner } from './agents/planner'
import { researcher } from './agents/researcher'
import { reviewer } from './agents/reviewer'
import { superagent } from './agents/superagent'
import { thinker } from './agents/thinker'
import { thinkingBase } from './agents/thinking-base'

import type { AgentTemplate } from './types'
import type { AgentTemplateType } from '@codebuff/common/types/session-state'

export const agentTemplates: Record<AgentTemplateType | string, AgentTemplate> =
  {
    [AgentTemplateTypes.base]: {
      id: AgentTemplateTypes.base,
      ...base(models.openrouter_claude_sonnet_4),
    },
    [AgentTemplateTypes.base_lite]: {
      id: AgentTemplateTypes.base_lite,
      ...base(models.openrouter_gpt5),
    },
    [AgentTemplateTypes.base_max]: {
      id: AgentTemplateTypes.base_max,
      ...base(models.openrouter_claude_opus_4),
    },
    [AgentTemplateTypes.base_experimental]: {
      id: AgentTemplateTypes.base_experimental,
      ...base(models.gemini2_5_pro_preview),
    },
    [AgentTemplateTypes.ask]: {
      id: AgentTemplateTypes.ask,
      ...ask(models.gemini2_5_pro_preview),
    },
    [AgentTemplateTypes.superagent]: {
      id: AgentTemplateTypes.superagent,
      ...superagent(models.openrouter_claude_sonnet_4),
    },
    [AgentTemplateTypes.claude4_gemini_thinking]: {
      id: AgentTemplateTypes.claude4_gemini_thinking,
      ...thinkingBase(models.openrouter_claude_sonnet_4),
    },

    [AgentTemplateTypes.thinker]: {
      id: AgentTemplateTypes.thinker,
      ...thinker(models.openrouter_grok_4),
    },
    [AgentTemplateTypes.file_picker]: {
      id: AgentTemplateTypes.file_picker,
      ...filePicker(models.gemini2_5_flash),
    },
    [AgentTemplateTypes.researcher]: {
      id: AgentTemplateTypes.researcher,
      ...researcher(models.gemini2_5_flash),
    },
    [AgentTemplateTypes.planner]: {
      id: AgentTemplateTypes.planner,
      ...planner(models.openrouter_grok_4),
    },
    [AgentTemplateTypes.dry_run]: {
      id: AgentTemplateTypes.dry_run,
      ...dryRun(models.gemini2_5_flash),
    },
    [AgentTemplateTypes.reviewer]: {
      id: AgentTemplateTypes.reviewer,
      ...reviewer(models.gemini2_5_pro_preview),
    },
    [AgentTemplateTypes.file_explorer]: fileExplorer as any as AgentTemplate,
  }
