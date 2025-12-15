import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  assistantMessage,
  userMessage,
} from '@codebuff/common/util/messages'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import {
  clearAgentGeneratorCache,
  runProgrammaticStep,
} from '../run-programmatic-step'
import { clearAllProposedContent } from '../tools/handlers/tool/proposed-content-store'
import { mockFileContext } from './test-utils'
import * as toolExecutor from '../tools/tool-executor'

import type { AgentTemplate, StepGenerator } from '../templates/types'
import type { executeToolCall } from '../tools/tool-executor'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { ToolMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { AgentState } from '@codebuff/common/types/session-state'

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

/**
 * Tests for propose_str_replace and propose_write_file tools.
 * These tools allow agents to propose file edits without applying them,
 * returning unified diffs instead. This is useful for best-of-n editor patterns
 * where multiple implementations are generated and one is selected.
 */
describe('propose_str_replace and propose_write_file tools', () => {
  let mockTemplate: AgentTemplate
  let mockAgentState: AgentState
  let mockParams: ParamsOf<typeof runProgrammaticStep>
  let executeToolCallSpy: ReturnType<typeof spyOn<typeof toolExecutor, 'executeToolCall'>>
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

  // Mock file system - maps file paths to their contents
  const mockFiles: Record<string, string> = {}

  beforeEach(() => {
    // Reset mock file system
    mockFiles['src/utils.ts'] = `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`
    mockFiles['src/index.ts'] = `import { add } from './utils';
console.log(add(1, 2));
`

    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
      addAgentStep: async () => 'test-agent-step-id',
      sendAction: () => {},
    }

    // Mock executeToolCall to handle propose_* tools
    executeToolCallSpy = spyOn(
      toolExecutor,
      'executeToolCall',
    ).mockImplementation(async (options: ParamsOf<typeof executeToolCall>) => {
      const { toolName, input, toolResults, agentState } = options

      if (toolName === 'propose_str_replace') {
        const { path, replacements } = input as {
          path: string
          replacements: Array<{ old: string; new: string; allowMultiple: boolean }>
        }
        
        // Get current content (from proposed state or mock files)
        let content = mockFiles[path] ?? null
        
        if (content === null) {
          const errorResult: ToolMessage = {
            role: 'tool',
            toolName: 'propose_str_replace',
            toolCallId: `${toolName}-call-id`,
            content: [{ type: 'json', value: { file: path, errorMessage: `File not found: ${path}` } }],
          }
          toolResults.push(errorResult)
          agentState.messageHistory.push(errorResult)
          return
        }

        // Apply replacements
        const errors: string[] = []
        for (const replacement of replacements) {
          if (!content.includes(replacement.old)) {
            errors.push(`String not found: "${replacement.old.slice(0, 50)}..."`)
            continue
          }
          if (replacement.allowMultiple) {
            content = content.replaceAll(replacement.old, replacement.new)
          } else {
            content = content.replace(replacement.old, replacement.new)
          }
        }

        if (errors.length > 0) {
          const errorResult: ToolMessage = {
            role: 'tool',
            toolName: 'propose_str_replace',
            toolCallId: `${toolName}-call-id`,
            content: [{ type: 'json', value: { file: path, errorMessage: errors.join('; ') } }],
          }
          toolResults.push(errorResult)
          agentState.messageHistory.push(errorResult)
          return
        }

        // Generate unified diff
        const originalContent = mockFiles[path]!
        const diff = generateSimpleDiff(path, originalContent, content)
        
        // Store proposed content for future calls
        mockFiles[path] = content

        const successResult: ToolMessage = {
          role: 'tool',
          toolName: 'propose_str_replace',
          toolCallId: `${toolName}-call-id`,
          content: [{
            type: 'json',
            value: {
              file: path,
              message: 'Proposed string replacements',
              unifiedDiff: diff,
            },
          }],
        }
        toolResults.push(successResult)
        agentState.messageHistory.push(successResult)
      } else if (toolName === 'propose_write_file') {
        const { path, content: newContent } = input as {
          path: string
          instructions: string
          content: string
        }
        
        const originalContent = mockFiles[path] ?? ''
        const isNewFile = !(path in mockFiles)
        
        // Generate unified diff
        const diff = generateSimpleDiff(path, originalContent, newContent)
        
        // Store proposed content
        mockFiles[path] = newContent

        const successResult: ToolMessage = {
          role: 'tool',
          toolName: 'propose_write_file',
          toolCallId: `${toolName}-call-id`,
          content: [{
            type: 'json',
            value: {
              file: path,
              message: isNewFile ? `Proposed new file ${path}` : `Proposed changes to ${path}`,
              unifiedDiff: diff,
            },
          }],
        }
        toolResults.push(successResult)
        agentState.messageHistory.push(successResult)
      } else if (toolName === 'set_output') {
        agentState.output = input
        const result: ToolMessage = {
          role: 'tool',
          toolName: 'set_output',
          toolCallId: `${toolName}-call-id`,
          content: [{ type: 'json', value: 'Output set successfully' }],
        }
        toolResults.push(result)
        agentState.messageHistory.push(result)
      } else if (toolName === 'end_turn') {
        // No-op for end_turn
      }
    })

    // Mock crypto.randomUUID
    spyOn(crypto, 'randomUUID').mockImplementation(
      () => 'mock-uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    )

    // Create mock template for implementor agent
    mockTemplate = {
      id: 'test-implementor',
      displayName: 'Test Implementor',
      spawnerPrompt: 'Testing propose tools',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['propose_str_replace', 'propose_write_file', 'set_output', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'You are a code implementor that proposes changes.',
      instructionsPrompt: 'Implement the requested changes using propose_str_replace or propose_write_file.',
      stepPrompt: '',
      handleSteps: undefined,
    } as AgentTemplate

    // Create mock agent state
    const sessionState = getInitialSessionState(mockFileContext)
    mockAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'test-implementor-id',
      runId: 'test-run-id' as `${string}-${string}-${string}-${string}-${string}`,
      messageHistory: [
        userMessage('Add a multiply function to src/utils.ts'),
        assistantMessage('I will implement the changes.'),
      ],
      output: undefined,
      directCreditsUsed: 0,
      childRunIds: [],
    }

    // Create mock params
    mockParams = {
      ...agentRuntimeImpl,
      runId: 'test-run-id',
      ancestorRunIds: [],
      repoId: undefined,
      repoUrl: undefined,
      agentState: mockAgentState,
      template: mockTemplate,
      prompt: 'Add a multiply function to src/utils.ts',
      toolCallParams: {},
      userId: TEST_USER_ID,
      userInputId: 'test-user-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      onCostCalculated: async () => {},
      fileContext: mockFileContext,
      localAgentTemplates: {},
      system: 'Test system prompt',
      stepsComplete: false,
      stepNumber: 1,
      tools: {},
      logger,
      signal: new AbortController().signal,
    }
  })

  afterEach(() => {
    mock.restore()
    clearAgentGeneratorCache({ logger })
    clearAllProposedContent()
  })

  describe('propose_str_replace', () => {
    it('should propose string replacement and return unified diff', async () => {
      const toolResultsCapture: any[] = []

      const mockGenerator = (function* () {
        const step = yield {
          toolName: 'propose_str_replace',
          input: {
            path: 'src/utils.ts',
            replacements: [{
              old: 'export function subtract(a: number, b: number): number {\n  return a - b;\n}',
              new: `export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}`,
              allowMultiple: false,
            }],
          },
        }
        toolResultsCapture.push(step.toolResult)
        
        const firstResult = step.toolResult?.[0]
        const unifiedDiff = firstResult?.type === 'json' ? (firstResult.value as { unifiedDiff?: string })?.unifiedDiff : undefined
        yield {
          toolName: 'set_output',
          input: {
            toolCalls: [{ toolName: 'propose_str_replace', input: step }],
            toolResults: step.toolResult,
            unifiedDiffs: unifiedDiff ?? '',
          },
        }
        yield { toolName: 'end_turn', input: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockParams)

      expect(result.endTurn).toBe(true)
      expect(executeToolCallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'propose_str_replace',
        }),
      )

      // Verify tool result contains unified diff
      expect(toolResultsCapture).toHaveLength(1)
      const toolResult = toolResultsCapture[0]
      expect(toolResult).toBeDefined()
      expect(toolResult[0].type).toBe('json')
      const jsonResult = toolResult[0] as { type: 'json'; value: { file: string; unifiedDiff: string } }
      expect(jsonResult.value.file).toBe('src/utils.ts')
      expect(jsonResult.value.unifiedDiff).toContain('+export function multiply')
      expect(jsonResult.value.unifiedDiff).toContain('return a * b')
    })

    it('should return error when string not found', async () => {
      const toolResultsCapture: any[] = []

      const mockGenerator = (function* () {
        const step = yield {
          toolName: 'propose_str_replace',
          input: {
            path: 'src/utils.ts',
            replacements: [{
              old: 'nonexistent string that does not exist in the file',
              new: 'replacement',
              allowMultiple: false,
            }],
          },
        }
        toolResultsCapture.push(step.toolResult)
        yield { toolName: 'end_turn', input: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      await runProgrammaticStep(mockParams)

      expect(toolResultsCapture).toHaveLength(1)
      const toolResult = toolResultsCapture[0]
      const jsonResult = toolResult[0] as { type: 'json'; value: { errorMessage: string } }
      expect(jsonResult.value.errorMessage).toContain('String not found')
    })

    it('should stack multiple replacements on the same file', async () => {
      const toolResultsCapture: any[] = []

      const mockGenerator = (function* () {
        // First replacement
        const step1 = yield {
          toolName: 'propose_str_replace',
          input: {
            path: 'src/utils.ts',
            replacements: [{
              old: 'return a + b;',
              new: 'return a + b; // addition',
              allowMultiple: false,
            }],
          },
        }
        toolResultsCapture.push({ step: 1, result: step1.toolResult })

        // Second replacement should work on the already-modified content
        const step2 = yield {
          toolName: 'propose_str_replace',
          input: {
            path: 'src/utils.ts',
            replacements: [{
              old: 'return a - b;',
              new: 'return a - b; // subtraction',
              allowMultiple: false,
            }],
          },
        }
        toolResultsCapture.push({ step: 2, result: step2.toolResult })

        yield { toolName: 'end_turn', input: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      await runProgrammaticStep(mockParams)

      expect(toolResultsCapture).toHaveLength(2)
      
      // Both replacements should succeed
      const result0 = toolResultsCapture[0].result[0] as { type: 'json'; value: { unifiedDiff: string } }
      const result1 = toolResultsCapture[1].result[0] as { type: 'json'; value: { unifiedDiff: string } }
      expect(result0.value.unifiedDiff).toContain('// addition')
      expect(result1.value.unifiedDiff).toContain('// subtraction')
      
      // Final file should have both changes
      expect(mockFiles['src/utils.ts']).toContain('// addition')
      expect(mockFiles['src/utils.ts']).toContain('// subtraction')
    })
  })

  describe('propose_write_file', () => {
    it('should propose new file creation and return unified diff', async () => {
      const toolResultsCapture: any[] = []

      const mockGenerator = (function* () {
        const step = yield {
          toolName: 'propose_write_file',
          input: {
            path: 'src/multiply.ts',
            instructions: 'Create multiply function',
            content: `export function multiply(a: number, b: number): number {
  return a * b;
}
`,
          },
        }
        toolResultsCapture.push(step.toolResult)
        yield { toolName: 'end_turn', input: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      await runProgrammaticStep(mockParams)

      expect(toolResultsCapture).toHaveLength(1)
      const toolResult = toolResultsCapture[0]
      const jsonResult = toolResult[0] as { type: 'json'; value: { file: string; message: string; unifiedDiff: string } }
      expect(jsonResult.value.file).toBe('src/multiply.ts')
      expect(jsonResult.value.message).toContain('new file')
      expect(jsonResult.value.unifiedDiff).toContain('+export function multiply')
    })

    it('should propose file edit and return unified diff', async () => {
      const toolResultsCapture: any[] = []

      const mockGenerator = (function* () {
        const step = yield {
          toolName: 'propose_write_file',
          input: {
            path: 'src/utils.ts',
            instructions: 'Add multiply function',
            content: `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`,
          },
        }
        toolResultsCapture.push(step.toolResult)
        yield { toolName: 'end_turn', input: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      await runProgrammaticStep(mockParams)

      expect(toolResultsCapture).toHaveLength(1)
      const toolResult = toolResultsCapture[0]
      const jsonResult = toolResult[0] as { type: 'json'; value: { file: string; message: string; unifiedDiff: string } }
      expect(jsonResult.value.file).toBe('src/utils.ts')
      expect(jsonResult.value.message).toContain('changes')
      expect(jsonResult.value.unifiedDiff).toContain('+export function multiply')
    })
  })

  describe('implementor agent workflow', () => {
    it('should receive tool results from previous tool calls across multiple steps', async () => {
      /**
       * This test verifies that when an agent makes multiple tool calls,
       * each subsequent yield receives the tool result from the previous call.
       * This is critical for the implementor2 pattern where the agent needs to
       * see the unified diff results to know what changes were proposed.
       */
      const receivedToolResults: any[] = []

      const mockGenerator = (function* () {
        // First tool call - propose_str_replace
        const step1 = yield {
          toolName: 'propose_str_replace',
          input: {
            path: 'src/utils.ts',
            replacements: [{
              old: 'return a + b;',
              new: 'return a + b; // first change',
              allowMultiple: false,
            }],
          },
        }
        const step1First = step1.toolResult?.[0]
        const step1HasDiff = step1First?.type === 'json' && !!(step1First.value as { unifiedDiff?: string })?.unifiedDiff
        receivedToolResults.push({
          step: 1,
          toolResult: step1.toolResult,
          hasUnifiedDiff: step1HasDiff,
        })

        // Second tool call - another propose_str_replace
        const step2 = yield {
          toolName: 'propose_str_replace',
          input: {
            path: 'src/utils.ts',
            replacements: [{
              old: 'return a - b;',
              new: 'return a - b; // second change',
              allowMultiple: false,
            }],
          },
        }
        const step2First = step2.toolResult?.[0]
        const step2HasDiff = step2First?.type === 'json' && !!(step2First.value as { unifiedDiff?: string })?.unifiedDiff
        receivedToolResults.push({
          step: 2,
          toolResult: step2.toolResult,
          hasUnifiedDiff: step2HasDiff,
        })

        // Third tool call - propose_write_file
        const step3 = yield {
          toolName: 'propose_write_file',
          input: {
            path: 'src/new-file.ts',
            instructions: 'Create new file',
            content: 'export const newFile = true;',
          },
        }
        const step3First = step3.toolResult?.[0]
        const step3HasDiff = step3First?.type === 'json' && !!(step3First.value as { unifiedDiff?: string })?.unifiedDiff
        receivedToolResults.push({
          step: 3,
          toolResult: step3.toolResult,
          hasUnifiedDiff: step3HasDiff,
        })

        yield { toolName: 'end_turn', input: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockParams)

      expect(result.endTurn).toBe(true)
      
      // Verify we received tool results for all 3 steps
      expect(receivedToolResults).toHaveLength(3)
      
      // Step 1: Should have received tool result with unified diff
      expect(receivedToolResults[0].step).toBe(1)
      expect(receivedToolResults[0].toolResult).toBeDefined()
      expect(receivedToolResults[0].hasUnifiedDiff).toBe(true)
      const step1Result = receivedToolResults[0].toolResult[0] as { type: 'json'; value: { file: string; unifiedDiff: string } }
      expect(step1Result.value.file).toBe('src/utils.ts')
      expect(step1Result.value.unifiedDiff).toContain('first change')
      
      // Step 2: Should have received tool result with unified diff
      expect(receivedToolResults[1].step).toBe(2)
      expect(receivedToolResults[1].toolResult).toBeDefined()
      expect(receivedToolResults[1].hasUnifiedDiff).toBe(true)
      const step2Result = receivedToolResults[1].toolResult[0] as { type: 'json'; value: { file: string; unifiedDiff: string } }
      expect(step2Result.value.file).toBe('src/utils.ts')
      expect(step2Result.value.unifiedDiff).toContain('second change')
      
      // Step 3: Should have received tool result with unified diff for new file
      expect(receivedToolResults[2].step).toBe(3)
      expect(receivedToolResults[2].toolResult).toBeDefined()
      expect(receivedToolResults[2].hasUnifiedDiff).toBe(true)
      const step3Result = receivedToolResults[2].toolResult[0] as { type: 'json'; value: { file: string; message: string } }
      expect(step3Result.value.file).toBe('src/new-file.ts')
      expect(step3Result.value.message).toContain('new file')
    })

    it('should collect tool calls and results for output', async () => {
      /**
       * This test simulates the editor-implementor2 workflow:
       * 1. Agent makes propose_* tool calls
       * 2. Tool results (with unified diffs) are captured
       * 3. Agent extracts tool calls and diffs for set_output
       */
      // Capture tool results as they come in
      const capturedToolResults: any[] = []
      const capturedToolCalls: { toolName: string; input: any }[] = []

      const mockGenerator = (function* () {
        // Make a propose_str_replace call
        const step1 = yield {
          toolName: 'propose_str_replace',
          input: {
            path: 'src/utils.ts',
            replacements: [{
              old: 'export function subtract(a: number, b: number): number {\n  return a - b;\n}',
              new: `export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}`,
              allowMultiple: false,
            }],
          },
        }
        
        // Capture the tool call and result
        capturedToolCalls.push({
          toolName: 'propose_str_replace',
          input: step1,
        })
        const step1First = step1.toolResult?.[0]
        if (step1First?.type === 'json' && step1First.value) {
          capturedToolResults.push(step1First.value)
        }

        // Generate unified diffs string from captured results
        const unifiedDiffs = capturedToolResults
          .filter((result: any) => result.unifiedDiff)
          .map((result: any) => `--- ${result.file} ---\n${result.unifiedDiff}`)
          .join('\n\n')

        yield {
          toolName: 'set_output',
          input: {
            toolCalls: capturedToolCalls,
            toolResults: capturedToolResults,
            unifiedDiffs,
          },
        }
        yield { toolName: 'end_turn', input: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockParams)

      expect(result.endTurn).toBe(true)
      expect(result.agentState.output).toBeDefined()
      
      const output = result.agentState.output as {
        toolCalls: any[]
        toolResults: any[]
        unifiedDiffs: string
      }

      // Verify tool calls were captured
      expect(output.toolCalls).toHaveLength(1)
      expect(output.toolCalls[0].toolName).toBe('propose_str_replace')

      // Verify tool results were captured
      expect(output.toolResults).toHaveLength(1)
      expect(output.toolResults[0].file).toBe('src/utils.ts')
      expect(output.toolResults[0].unifiedDiff).toContain('+export function multiply')

      // Verify unified diffs string was generated
      expect(output.unifiedDiffs).toContain('--- src/utils.ts ---')
      expect(output.unifiedDiffs).toContain('+export function multiply')
    })
  })
})

/**
 * Simple diff generator for testing purposes.
 * In production, the actual handlers use the 'diff' library.
 */
function generateSimpleDiff(path: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  
  const diffLines: string[] = []
  const maxLen = Math.max(oldLines.length, newLines.length)
  
  let inChange = false
  let changeStart = 0
  
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    
    if (oldLine !== newLine) {
      if (!inChange) {
        inChange = true
        changeStart = i
        diffLines.push(`@@ -${i + 1},${oldLines.length - i} +${i + 1},${newLines.length - i} @@`)
      }
      if (oldLine !== undefined) {
        diffLines.push(`-${oldLine}`)
      }
      if (newLine !== undefined) {
        diffLines.push(`+${newLine}`)
      }
    } else if (inChange && oldLine === newLine) {
      diffLines.push(` ${oldLine}`)
    }
  }
  
  return diffLines.join('\n')
}
