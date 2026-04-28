import { describe, expect, it } from 'bun:test'

import { prepareTools } from './openai-compatible-prepare-tools'

describe('prepareTools', () => {
  it('adds stable ids to function tool definitions', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'function',
          name: 'read_files',
          description: 'Read files',
          inputSchema: { type: 'object' },
        },
        {
          type: 'function',
          name: 'write_todos',
          description: 'Write todos',
          inputSchema: { type: 'object' },
        },
      ],
    })

    expect(result.tools).toEqual([
      {
        id: 'tool_1',
        type: 'function',
        function: {
          name: 'read_files',
          description: 'Read files',
          parameters: { type: 'object' },
        },
      },
      {
        id: 'tool_2',
        type: 'function',
        function: {
          name: 'write_todos',
          description: 'Write todos',
          parameters: { type: 'object' },
        },
      },
    ])
  })
})
