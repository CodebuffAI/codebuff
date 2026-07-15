import { describe, expect, test } from 'bun:test'

import browserUse from '../browser-use/browser-use'
import researcherDocs from '../researcher/researcher-docs'

describe('audited specialist contracts', () => {
  test('browser-use defaults to read-only interaction and proportional media evidence', () => {
    expect(
      browserUse.inputSchema?.params?.properties?.interactionPolicy,
    ).toMatchObject({
      default: 'read-only',
      enum: ['read-only', 'allow-interactions'],
    })
    expect(browserUse.terminalPermissionProfile).toBe('read-only')

    const prompts = `${browserUse.systemPrompt}\n${browserUse.instructionsPrompt}`
    expect(prompts).toContain('Do not generate all media types')
    expect(prompts).toContain('Use PDF only')
    expect(prompts).toContain('recording start/stop only')
    expect(prompts).not.toContain(
      'explicitly exercise screenshot, pdf, and recording',
    )
  })

  test('researcher-docs exposes structured source, version, and failure state', () => {
    expect(researcherDocs.outputMode).toBe('structured_output')
    expect(researcherDocs.outputSchema?.required).toEqual([
      'status',
      'answer',
      'source',
      'version',
    ])
    expect(researcherDocs.outputSchema?.properties?.status).toMatchObject({
      enum: ['answered', 'partial', 'failed'],
    })
    expect(researcherDocs.outputSchema?.properties).toHaveProperty('failure')
  })
})
