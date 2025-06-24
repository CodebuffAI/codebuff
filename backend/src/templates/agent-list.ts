import { AgentTemplateType } from '@codebuff/common/types/session-state'

import { claude4_base } from './agents/claude4_base'
import { file_picker } from './agents/file-picker'
import { gemini25flash_base } from './agents/gemini25flash_base'
import { gemini25pro_thinking } from './agents/gemini25pro_thinking'
import { gemini25pro_base } from './agents/gemini25pro_base'
import { AgentTemplate } from './types'
import { claude4_gemini_thinking } from './agents/claude4_gemini_thinking'

export const agentTemplates: Record<AgentTemplateType, AgentTemplate> = {
  claude4_base,
  gemini25pro_base,
  gemini25flash_base,
  gemini25pro_thinking,
  claude4_gemini_thinking,

  file_picker,
}
