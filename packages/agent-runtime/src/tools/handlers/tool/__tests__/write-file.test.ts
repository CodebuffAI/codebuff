import { describe, expect, it } from 'bun:test'

import { handleCreatePlan } from '../create-plan'
import {
  getFileProcessingValues,
  type FileProcessingState,
} from '../write-file'

import type {
  ClientToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

function createFileProcessingState(): FileProcessingState {
  return {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    failedEditRequiresReadByPath: {},
  }
}

describe('handleCreatePlan', () => {
  it('initializes file processing state for a new plan path', async () => {
    const path = '.agents/sessions/anonymous-mental-health-app/SPEC.md'
    const plan = '# SPEC.md — Anonymous Mental Health App\n'
    const fileProcessingState = createFileProcessingState()
    const clientToolCalls: ClientToolCall<'create_plan'>[] = []

    const result = await handleCreatePlan({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'create-plan-new-path',
        toolName: 'create_plan',
        input: { path, plan },
      },
      fileProcessingState,
      logger,
      requestClientToolCall: async (
        toolCall: ClientToolCall<'create_plan'>,
      ): Promise<CodebuffToolOutput<'create_plan'>> => {
        clientToolCalls.push(toolCall)
        return [
          {
            type: 'json',
            value: {
              file: toolCall.input.path,
              message: 'Plan written',
            },
          },
        ]
      },
      writeToClient: () => {},
    })

    expect(fileProcessingState.promisesByPath[path]).toHaveLength(1)
    expect(fileProcessingState.allPromises).toHaveLength(1)
    expect(clientToolCalls).toHaveLength(1)
    expect(clientToolCalls[0]).toMatchObject({
      toolCallId: 'create-plan-new-path',
      toolName: 'create_plan',
      input: {
        type: 'file',
        path,
        content: plan,
      },
    })
    expect(result.output).toEqual([
      {
        type: 'json',
        value: {
          file: path,
          message: 'Plan written',
        },
      },
    ])
  })
})

describe('handleWriteFile', () => {
  describe('getFileProcessingValues', () => {
    it('should copy file processing state values', () => {
      const state: FileProcessingState = {
        promisesByPath: { 'test.ts': [] },
        allPromises: [],
        fileChangeErrors: [],
        fileChanges: [],
        firstFileProcessed: true,
        failedEditRequiresReadByPath: {},
      }

      const result = getFileProcessingValues(state)
      expect(result.firstFileProcessed).toBe(true)
      expect(result.promisesByPath).toEqual({ 'test.ts': [] })
    })
  })
})
