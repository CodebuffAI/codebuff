import { insertTrace } from '@codebuff/bigquery'
import { trackEvent } from '@codebuff/common/analytics'
import type { AgentRuntimeEnvironment, LLMEnvironment } from '@codebuff/agent-runtime'

import { getAgentTemplate, assembleLocalAgentTemplates } from '../templates/agent-registry'
import { getAgentPrompt } from '../templates/strings'
import { getAgentStreamFromTemplate } from '../prompt-agent-stream'
import { requestFiles, requestFile, requestToolCall } from '../websockets/websocket-action'
import { checkLiveUserInput, startUserInput, endUserInput } from '../live-user-inputs'
import { logger } from '../util/logger'
import { getRequestContext } from '../context/app-context'
import { codebuffToolDefs } from '../tools/definitions/list'
import { codebuffToolHandlers } from '../tools/handlers/list'

import type { WebSocket } from 'ws'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentTemplateType, AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

/**
 * Creates the complete agent runtime environment by wrapping existing backend services
 */
export function createAgentRuntimeEnvironment(
  ws: WebSocket,
  onResponseChunk?: (chunk: string | PrintModeEvent) => void,
): AgentRuntimeEnvironment {
  return {
    llm: {
      getAgentStreamFromTemplate: (params: Parameters<LLMEnvironment['getAgentStreamFromTemplate']>[0]) => {
        return getAgentStreamFromTemplate(params)
      },
    },

    io: {
      requestToolCall: async (userInputId: string, toolName: string, input: Record<string, any>) => {
        return await requestToolCall(ws, userInputId, toolName, input)
      },

      requestFiles: async (paths: string[]) => {
        return await requestFiles(ws, paths)
      },

      requestFile: async (path: string) => {
        return await requestFile(ws, path)
      },

      onResponseChunk,
    },

    inputGate: {
      start: (userId: string | undefined, userInputId: string) => {
        if (userId) {
          startUserInput(userId, userInputId)
        }
      },

      check: (userId: string | undefined, userInputId: string, clientSessionId: string) => {
        return checkLiveUserInput(userId, userInputId, clientSessionId)
      },

      end: (userId: string | undefined, userInputId: string) => {
        if (userId) {
          endUserInput(userId, userInputId)
        }
      },
    },

    tools: {
      definitions: codebuffToolDefs,
      handlers: codebuffToolHandlers,
    },

    templates: {
      getAgentTemplate: async (
        agentType: AgentTemplateType,
        localTemplates: Record<string, AgentTemplate>,
      ) => {
        return await getAgentTemplate(agentType, localTemplates)
      },

      getAgentPrompt: async (
        template: AgentTemplate,
        promptType: { type: 'systemPrompt' | 'instructionsPrompt' | 'stepPrompt' },
        fileContext: ProjectFileContext,
        agentState: AgentState,
        localTemplates: Record<string, AgentTemplate>,
      ) => {
        return await getAgentPrompt(
          template,
          promptType,
          fileContext,
          agentState,
          localTemplates,
        )
      },
    },

    analytics: {
      trackEvent: (event: string, userId: string, props: Record<string, any>) => {
        trackEvent(event as any, userId, props)
      },

      insertTrace: (trace: any) => {
        insertTrace(trace)
      },
    },

    logger: {
      debug: (data: any, message?: string) => logger.debug(data, message),
      info: (data: any, message?: string) => logger.info(data, message),
      warn: (data: any, message?: string) => logger.warn(data, message),
      error: (data: any, message?: string) => logger.error(data, message),
    },

    requestContext: getRequestContext(),
  }
}
