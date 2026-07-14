import { describe, expect, test } from 'bun:test'

import { toolMetadata } from '@codebuff/common/tools/metadata'
import { toolNames } from '@codebuff/common/tools/constants'
import { getRegisteredToolNames, toolRendererDispositions } from '../registry'

describe('tool renderer metadata', () => {
  test('[DEP-M02] every native tool has an explicit renderer disposition', () => {
    expect(Object.keys(toolRendererDispositions).sort()).toEqual(
      [...toolNames].sort(),
    )
    for (const toolName of toolNames) {
      expect(['custom', 'fallback', 'hidden']).toContain(
        toolRendererDispositions[toolName],
      )
      if (toolMetadata[toolName].renderer === 'custom') {
        expect(getRegisteredToolNames()).toContain(toolName)
      }
    }
  })
})
