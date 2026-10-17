import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { describe, expect, mock, test } from 'bun:test'

import { createExecutionPolicy } from '../execution-policy'
import { handleToolCall } from '../../run'

async function dispatchApplyPatch(path: string) {
  const writeOverride = mock(async () => [
    { type: 'json' as const, value: { message: 'patch dispatched' } },
  ])
  const result = await handleToolCall({
    action: {
      type: 'tool-call-request',
      requestId: crypto.randomUUID(),
      userInputId: 'test-input',
      toolName: 'apply_patch',
      input: {
        operation: {
          type: 'create_file',
          path,
          diff: '@@\n+content\n',
        },
      },
      timeout: undefined,
    },
    overrides: { write_file: writeOverride },
    customToolDefinitions: {},
    cwd: '/project',
    fs: createMockFs(),
    policy: createExecutionPolicy({
      projectRoot: '/project',
      projectOnly: true,
    }),
  })
  return { result, writeOverride }
}

describe('apply_patch project-only target resolution', () => {
  test('dispatches a patch targeting a file inside the project', async () => {
    const { result, writeOverride } = await dispatchApplyPatch('src/new.ts')

    expect(writeOverride).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result.output)).toContain('patch dispatched')
  })

  test('rejects a patch targeting a file outside the project', async () => {
    const { result, writeOverride } = await dispatchApplyPatch('../outside.txt')

    expect(writeOverride).not.toHaveBeenCalled()
    expect(JSON.stringify(result.output)).toContain('outside project root')
  })
})
