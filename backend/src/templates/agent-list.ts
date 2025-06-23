import { AgentTemplateType } from 'common/types/session-state'

import { claude4_base } from './agents/claude4base'
import { gemini25flash_base } from './agents/gemini25flash_base'
import { gemini25pro_base } from './agents/gemini25pro_base'
import { gemini25pro_readonly } from './agents/gemini25pro_readonly'
import { gemini25pro_thinking } from './agents/gemini25pro_thinking'
import { AgentTemplate } from './types'

export const agentTemplates: Record<AgentTemplateType, AgentTemplate> = {
  claude4_base,
  gemini25pro_base,
  gemini25flash_base,

  gemini25pro_thinking,
  gemini25pro_readonly,
}
