import {
  AgentTemplateType,
  AgentTemplateTypes,
} from '@codebuff/common/types/session-state'

import { models } from '@codebuff/common/constants'
import { base } from './agents/base'
import { filePicker } from './agents/file-picker'
import { thinker } from './agents/thinker'
import { thinkingBase } from './agents/thinking-base'
import { AgentTemplate } from './types'
import { planner } from './agents/planner'
import { reviewer } from './agents/reviewer'
import { dryRun } from './agents/dry-run'

export const agentTemplates: Record<AgentTemplateType, AgentTemplate> = {
  opus4_base: {
    type: AgentTemplateTypes.opus4_base,
    ...base(models.opus4),
  },
  claude4_base: {
    type: AgentTemplateTypes.claude4_base,
    ...base(models.sonnet),
  },
  gemini25pro_base: {
    type: AgentTemplateTypes.gemini25pro_base,
    ...base(models.gemini2_5_pro_preview),
  },
  gemini25flash_base: {
    type: AgentTemplateTypes.gemini25flash_base,
    ...base(models.gemini2_5_flash),
  },
  claude4_gemini_thinking: {
    type: AgentTemplateTypes.claude4_gemini_thinking,
    ...thinkingBase(models.sonnet),
  },

  gemini25pro_thinker: {
    type: AgentTemplateTypes.gemini25pro_thinker,
    ...thinker(models.gemini2_5_pro_preview),
  },
  gemini25flash_file_picker: {
    type: AgentTemplateTypes.gemini25flash_file_picker,
    ...filePicker(models.gemini2_5_flash),
  },
  gemini25pro_planner: {
    type: AgentTemplateTypes.gemini25pro_planner,
    ...planner(models.gemini2_5_pro_preview),
  },
  gemini25flash_dry_run: {
    type: AgentTemplateTypes.gemini25flash_dry_run,
    ...dryRun(models.gemini2_5_flash),
  },
  gemini25pro_reviewer: {
    type: AgentTemplateTypes.gemini25pro_reviewer,
    ...reviewer(models.gemini2_5_pro_preview),
  },
}
