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

export const agentTemplates: Record<AgentTemplateType, AgentTemplate> = {
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

  gemini25pro_thinking: {
    type: AgentTemplateTypes.gemini25pro_thinking,
    ...thinker(models.gemini2_5_pro_preview),
  },
  gemini25flash_file_picker: {
    type: AgentTemplateTypes.gemini25flash_file_picker,
    ...filePicker(models.gemini2_5_flash),
  },
}
