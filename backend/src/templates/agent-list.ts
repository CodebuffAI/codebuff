import {
  AgentTemplateType,
  AgentTemplateTypes,
} from '@codebuff/common/types/session-state'

import { models } from '@codebuff/common/constants'
import { ask } from './agents/ask'
import { base } from './agents/base'
import { dryRun } from './agents/dry-run'
import { filePickerWorker } from './agents/file-picker-worker'
import { filePicker } from './agents/file-picker'
import { planner } from './agents/planner'
import { researcher } from './agents/researcher'
import { reviewer } from './agents/reviewer'
import { thinker } from './agents/thinker'
import { thinkingBase } from './agents/thinking-base'
import { AgentTemplate, readOnlyToolNames } from './types'

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
  gemini25pro_ask: {
    type: AgentTemplateTypes.gemini25pro_ask,
    ...ask(models.gemini2_5_pro_preview),
    toolNames: readOnlyToolNames,
    spawnableAgents: [AgentTemplateTypes.file_picker],
  },
  claude4_gemini_thinking: {
    type: AgentTemplateTypes.claude4_gemini_thinking,
    ...thinkingBase(models.sonnet),
  },

  gemini25pro_thinker: {
    type: AgentTemplateTypes.gemini25pro_thinker,
    ...thinker(models.gemini2_5_pro_preview),
  },
  file_picker_worker: {
    type: AgentTemplateTypes.file_picker_worker,
    ...filePickerWorker(models.gemini2_5_flash),
  },
  file_picker: {
    type: AgentTemplateTypes.file_picker,
    ...filePicker(models.gemini2_5_pro_preview),
  },
  gemini25flash_researcher: {
    type: AgentTemplateTypes.gemini25flash_researcher,
    ...researcher(models.gemini2_5_flash),
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
