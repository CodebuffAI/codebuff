import { describe, expect, test } from 'bun:test'

import {
  getAgentBaseName,
  extractPlanFromBuffer,
  autoCollapseBlocks,
  extractSpawnAgentResultContent,
  appendInterruptionNotice,
  createAgentBlock,
  updateBlocksRecursively,
  nestBlockUnderParent,
  extractBlockById,
  transformAskUserBlocks,
  updateToolBlockWithOutput,
  scrubPlanTags,
  scrubPlanTagsInBlocks,
  insertPlanBlock,
  moveSpawnAgentBlock,
  extractPlanMetadata,
  parseGateStateBlock,
  scrubGateStateTags,
} from '../message-block-helpers'

import { isPlanBlock, isGateStateBlock } from '../../types/chat'

import type {
  ContentBlock,
  AgentContentBlock,
  AskUserContentBlock,
  TextContentBlock,
  ToolContentBlock,
} from '../../types/chat'

describe('getAgentBaseName', () => {
  test('extracts base name from scoped versioned name', () => {
    expect(getAgentBaseName('openbuff/file-picker@0.0.2')).toBe('file-picker')
  })

  test('extracts base name from simple versioned name', () => {
    expect(getAgentBaseName('file-picker@1.0.0')).toBe('file-picker')
  })

  test('returns simple name unchanged', () => {
    expect(getAgentBaseName('file-picker')).toBe('file-picker')
  })

  test('normalizes direct tool aliases to canonical agent names', () => {
    expect(getAgentBaseName('code_searcher')).toBe('code-searcher')
  })

  test('handles scoped name without version', () => {
    expect(getAgentBaseName('openbuff/file-picker')).toBe('file-picker')
  })

  test('handles empty string', () => {
    expect(getAgentBaseName('')).toBe('')
  })

  test('handles name with multiple slashes', () => {
    expect(getAgentBaseName('@scope/sub/agent@1.0.0')).toBe('agent')
  })
})

describe('extractPlanFromBuffer', () => {
  test('extracts plan content between tags', () => {
    const buffer = 'Some text <PLAN>This is the plan</PLAN> more text'
    expect(extractPlanFromBuffer(buffer)).toBe('This is the plan')
  })

  test('trims whitespace from extracted plan', () => {
    const buffer = '<PLAN>  \n  Plan with whitespace  \n  </PLAN>'
    expect(extractPlanFromBuffer(buffer)).toBe('Plan with whitespace')
  })

  test('returns null when no opening tag', () => {
    const buffer = 'This is the plan</PLAN>'
    expect(extractPlanFromBuffer(buffer)).toBeNull()
  })

  test('returns null when no closing tag', () => {
    const buffer = '<PLAN>This is the plan'
    expect(extractPlanFromBuffer(buffer)).toBeNull()
  })

  test('returns null when tags are in wrong order', () => {
    const buffer = '</PLAN>content<PLAN>'
    expect(extractPlanFromBuffer(buffer)).toBeNull()
  })

  test('returns null for empty buffer', () => {
    expect(extractPlanFromBuffer('')).toBeNull()
  })

  test('handles multiline plan content', () => {
    const buffer =
      '<PLAN>\n1. First step\n2. Second step\n3. Third step\n</PLAN>'
    expect(extractPlanFromBuffer(buffer)).toBe(
      '1. First step\n2. Second step\n3. Third step',
    )
  })
})

describe('scrubPlanTags helpers', () => {
  test('removes plan tags from text', () => {
    expect(scrubPlanTags('<PLAN>Plan</PLAN> trailing')).toBe(' trailing')
  })

  test('scrubs plan tags inside text blocks and removes empties', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: '<PLAN>Plan</PLAN>' },
      { type: 'text', content: 'Keep me' },
      { type: 'tool', toolCallId: 'id', toolName: 'read_files', input: {} },
    ]
    const result = scrubPlanTagsInBlocks(blocks)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'text', content: 'Keep me' })
    expect(result[1].type).toBe('tool')
  })

  test('inserts plan block after scrubbing', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Intro <PLAN>secret</PLAN>' },
    ]
    const result = insertPlanBlock(blocks, 'Plan body')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'text', content: 'Intro ' })
    expect(result[1]).toEqual({ type: 'plan', content: 'Plan body' })
  })

  test('extracts durable plan artifact metadata from explicit artifact lines', () => {
    const metadata = extractPlanMetadata(
      `# Plan\n\n## Artifacts\n- Session: .agents/sessions/auth-refresh\n- SPEC.md: .agents/sessions/auth-refresh/SPEC.md\n- PLAN.md: .agents/sessions/auth-refresh/PLAN.md\n- STATUS.md: .agents/sessions/auth-refresh/STATUS.md\n- LESSONS.md: .agents/sessions/auth-refresh/LESSONS.md`,
    )

    expect(metadata).toEqual({
      sessionPath: '.agents/sessions/auth-refresh',
      specPath: '.agents/sessions/auth-refresh/SPEC.md',
      planPath: '.agents/sessions/auth-refresh/PLAN.md',
      statusPath: '.agents/sessions/auth-refresh/STATUS.md',
      lessonsPath: '.agents/sessions/auth-refresh/LESSONS.md',
      executeCommand: '/mode:execute_plan Build it!',
      resumeCommand: '/resume-plan .agents/sessions/auth-refresh',
      updateCommand: '/update-plan .agents/sessions/auth-refresh',
      statusCommand: '/plan-status .agents/sessions/auth-refresh',
      lessonsCommand: '/lessons .agents/sessions/auth-refresh',
    })
  })

  test('detects artifact metadata while preserving simple plan compatibility', () => {
    expect(extractPlanMetadata('Just a simple plan')).toBeUndefined()

    const result = insertPlanBlock(
      [],
      '- STATUS.md: `.agents/sessions/foo/STATUS.md`',
    )
    expect(result[0]).toEqual({
      type: 'plan',
      content: '- STATUS.md: `.agents/sessions/foo/STATUS.md`',
      metadata: {
        statusPath: '.agents/sessions/foo/STATUS.md',
        executeCommand: '/mode:execute_plan Build it!',
        resumeCommand: '/resume-plan .agents/sessions/foo',
        updateCommand: '/update-plan .agents/sessions/foo',
        statusCommand: '/plan-status .agents/sessions/foo',
        lessonsCommand: '/lessons .agents/sessions/foo',
      },
    })
  })
  test('extracts metadata from markdown links and decorated labels', () => {
    const metadata = extractPlanMetadata(
      [
        '1. **Session Path**: [session](.agents/sessions/payments-rollout).',
        '2. `PLAN.md`: `.agents/sessions/payments-rollout/PLAN.md`,',
        '3. _STATUS.md_: [.agents/sessions/payments-rollout/STATUS.md](.agents/sessions/payments-rollout/STATUS.md);',
      ].join('\n'),
    )

    expect(metadata).toEqual({
      sessionPath: '.agents/sessions/payments-rollout',
      planPath: '.agents/sessions/payments-rollout/PLAN.md',
      statusPath: '.agents/sessions/payments-rollout/STATUS.md',
      executeCommand: '/mode:execute_plan Build it!',
      resumeCommand: '/resume-plan .agents/sessions/payments-rollout',
      updateCommand: '/update-plan .agents/sessions/payments-rollout',
      statusCommand: '/plan-status .agents/sessions/payments-rollout',
      lessonsCommand: '/lessons .agents/sessions/payments-rollout',
    })
  })

  test('infers session and artifacts from bare session paths', () => {
    const metadata = extractPlanMetadata(
      [
        'Artifacts live at `.agents/sessions/retry-flow/SPEC.md`.',
        'The plan file is `.agents/sessions/retry-flow/PLAN.md`.',
      ].join('\n'),
    )

    expect(metadata).toEqual({
      sessionPath: '.agents/sessions/retry-flow',
      specPath: '.agents/sessions/retry-flow/SPEC.md',
      planPath: '.agents/sessions/retry-flow/PLAN.md',
      executeCommand: '/mode:execute_plan Build it!',
      resumeCommand: '/resume-plan .agents/sessions/retry-flow',
      updateCommand: '/update-plan .agents/sessions/retry-flow',
      statusCommand: '/plan-status .agents/sessions/retry-flow',
      lessonsCommand: '/lessons .agents/sessions/retry-flow',
    })
  })

  test('captures unrecognized path-like Label: value lines as custom artifacts', () => {
    const metadata = extractPlanMetadata(
      [
        '## Artifacts',
        '- Session: .agents/sessions/auth-refresh',
        '- SPEC.md: .agents/sessions/auth-refresh/SPEC.md',
        '- PLAN.md: .agents/sessions/auth-refresh/PLAN.md',
        '- STATUS.md: .agents/sessions/auth-refresh/STATUS.md',
        '- LESSONS.md: .agents/sessions/auth-refresh/LESSONS.md',
        '- Architecture: .agents/sessions/auth-refresh/architecture.md',
        '- Wireframe: .agents/sessions/auth-refresh/wireframe.png',
        '- Architecture Doc: .agents/sessions/auth-refresh/architecture.md',
      ].join('\n'),
    )

    expect(metadata?.customArtifacts).toEqual([
      {
        label: 'Architecture',
        path: '.agents/sessions/auth-refresh/architecture.md',
      },
      {
        label: 'Wireframe',
        path: '.agents/sessions/auth-refresh/wireframe.png',
      },
      {
        label: 'Architecture Doc',
        path: '.agents/sessions/auth-refresh/architecture.md',
      },
    ])
    // Known labels must NOT collide with custom artifacts.
    expect(metadata?.specPath).toBe('.agents/sessions/auth-refresh/SPEC.md')
    expect(metadata?.planPath).toBe('.agents/sessions/auth-refresh/PLAN.md')
    expect(metadata?.statusPath).toBe('.agents/sessions/auth-refresh/STATUS.md')
    expect(metadata?.lessonsPath).toBe(
      '.agents/sessions/auth-refresh/LESSONS.md',
    )
    expect(metadata?.sessionPath).toBe('.agents/sessions/auth-refresh')
  })

  test('does not capture prose Label: value lines without path separators', () => {
    const metadata = extractPlanMetadata(
      [
        '- Session: .agents/sessions/auth-refresh',
        '- Note: this is important prose',
        '- Reminder: see the architecture doc for details',
        '- Architecture: .agents/sessions/auth-refresh/architecture.md',
      ].join('\n'),
    )

    expect(metadata?.customArtifacts).toEqual([
      {
        label: 'Architecture',
        path: '.agents/sessions/auth-refresh/architecture.md',
      },
    ])
  })

  test('preserves original casing when stripping markdown from custom labels', () => {
    const metadata = extractPlanMetadata(
      [
        '- **Architecture**: .agents/sessions/auth-refresh/architecture.md',
        '- _Wireframe_: .agents/sessions/auth-refresh/wireframe.png',
        '- `Schema`: .agents/sessions/auth-refresh/schema.md',
      ].join('\n'),
    )

    expect(metadata?.customArtifacts).toEqual([
      {
        label: 'Architecture',
        path: '.agents/sessions/auth-refresh/architecture.md',
      },
      {
        label: 'Wireframe',
        path: '.agents/sessions/auth-refresh/wireframe.png',
      },
      { label: 'Schema', path: '.agents/sessions/auth-refresh/schema.md' },
    ])
  })

  test('custom artifacts alone make metadata non-empty', () => {
    const metadata = extractPlanMetadata(
      ['- Architecture: .agents/sessions/auth-refresh/architecture.md'].join(
        '\n',
      ),
    )

    expect(metadata).toBeDefined()
    expect(metadata?.customArtifacts).toEqual([
      {
        label: 'Architecture',
        path: '.agents/sessions/auth-refresh/architecture.md',
      },
    ])
    // No known artifact paths or commands were inferred.
    expect(metadata?.sessionPath).toBeUndefined()
    expect(metadata?.executeCommand).toBeUndefined()
  })

  test('captures custom artifacts from numbered list lines without bullet prefix', () => {
    const metadata = extractPlanMetadata(
      [
        '1. Session: .agents/sessions/auth-refresh',
        '2. Architecture: .agents/sessions/auth-refresh/architecture.md',
      ].join('\n'),
    )

    expect(metadata?.customArtifacts).toEqual([
      {
        label: 'Architecture',
        path: '.agents/sessions/auth-refresh/architecture.md',
      },
    ])
  })

  test('strips markdown link wrapper and trailing punctuation from custom artifact paths', () => {
    const metadata = extractPlanMetadata(
      [
        '- Architecture: [design doc](.agents/sessions/foo/architecture.md);',
        '- Wireframe: `.agents/sessions/foo/wireframe.png`.',
      ].join('\n'),
    )

    expect(metadata?.customArtifacts).toEqual([
      { label: 'Architecture', path: '.agents/sessions/foo/architecture.md' },
      { label: 'Wireframe', path: '.agents/sessions/foo/wireframe.png' },
    ])
  })

  test('captures custom artifact values that end with .md but have no path separator', () => {
    const metadata = extractPlanMetadata(
      ['- README: local-readme.md'].join('\n'),
    )

    expect(metadata?.customArtifacts).toEqual([
      { label: 'README', path: 'local-readme.md' },
    ])
    // No session path was inferred, so no commands are generated.
    expect(metadata?.sessionPath).toBeUndefined()
    expect(metadata?.executeCommand).toBeUndefined()
  })

  test('does not capture values without path separator or .md suffix', () => {
    const metadata = extractPlanMetadata(
      [
        '- Architecture: just a plain description',
        '- Notes: some words here',
      ].join('\n'),
    )

    expect(metadata).toBeUndefined()
  })

  test('does not capture label with empty value after normalization', () => {
    const metadata = extractPlanMetadata(['- Architecture: ```'].join('\n'))

    expect(metadata).toBeUndefined()
  })

  test('generates custom artifact commands for .md and non-.md paths', () => {
    const metadata = extractPlanMetadata(
      [
        '## Artifacts',
        '- Session: .agents/sessions/auth-refresh',
        '- SPEC.md: .agents/sessions/auth-refresh/SPEC.md',
        '- PLAN.md: .agents/sessions/auth-refresh/PLAN.md',
        '- STATUS.md: .agents/sessions/auth-refresh/STATUS.md',
        '- LESSONS.md: .agents/sessions/auth-refresh/LESSONS.md',
        '- Architecture: .agents/sessions/auth-refresh/architecture.md',
        '- Wireframe: .agents/sessions/auth-refresh/wireframe.png',
      ].join('\n'),
    )

    expect(metadata?.customArtifactCommands).toEqual([
      'Read .agents/sessions/auth-refresh/architecture.md',
      'Open .agents/sessions/auth-refresh/wireframe.png',
    ])
  })

  test('generates custom artifact commands even without session path', () => {
    const metadata = extractPlanMetadata(
      [
        '- Architecture: docs/architecture.md',
        '- Wireframe: assets/wireframe.png',
      ].join('\n'),
    )

    // No session path was inferred, so plan commands are not generated.
    expect(metadata?.executeCommand).toBeUndefined()
    expect(metadata?.resumeCommand).toBeUndefined()
    expect(metadata?.customArtifactCommands).toEqual([
      'Read docs/architecture.md',
      'Open assets/wireframe.png',
    ])
  })

  test('does not generate custom artifact commands when no custom artifacts exist', () => {
    const metadata = extractPlanMetadata(
      [
        '## Artifacts',
        '- Session: .agents/sessions/auth-refresh',
        '- SPEC.md: .agents/sessions/auth-refresh/SPEC.md',
        '- PLAN.md: .agents/sessions/auth-refresh/PLAN.md',
        '- STATUS.md: .agents/sessions/auth-refresh/STATUS.md',
        '- LESSONS.md: .agents/sessions/auth-refresh/LESSONS.md',
      ].join('\n'),
    )

    expect(metadata?.customArtifactCommands).toBeUndefined()
  })

  test('includes custom artifact commands alongside known plan commands', () => {
    const metadata = extractPlanMetadata(
      [
        '## Artifacts',
        '- Session: .agents/sessions/foo',
        '- Architecture: .agents/sessions/foo/architecture.md',
        '- Wireframe: .agents/sessions/foo/wireframe.png',
      ].join('\n'),
    )

    expect(metadata?.resumeCommand).toBe('/resume-plan .agents/sessions/foo')
    expect(metadata?.customArtifactCommands).toEqual([
      'Read .agents/sessions/foo/architecture.md',
      'Open .agents/sessions/foo/wireframe.png',
    ])
  })

  test('removes legacy and unterminated plan tags from text', () => {
    expect(scrubPlanTags('before <PLAN>old</cb_plan> after')).toBe(
      'before  after',
    )
    expect(scrubPlanTags('before <PLAN>streaming plan')).toBe('before ')
  })

  test('identifies inserted plan blocks with the plan type guard', () => {
    const result = insertPlanBlock([], 'Plan body')

    expect(isPlanBlock(result[0])).toBe(true)
  })
})

describe('autoCollapseBlocks', () => {
  test('collapses text blocks with thinkingId', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'thinking', thinkingId: 'think-1' },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toHaveProperty('thinkingCollapseState', 'hidden')
  })

  test('preserves user-opened text blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: 'thinking',
        thinkingId: 'think-1',
        userOpened: true,
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).not.toHaveProperty('isCollapsed')
  })

  test('collapses agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test Agent',
        agentType: 'test',
        content: '',
        status: 'complete',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toHaveProperty('isCollapsed', true)
  })

  test('recursively collapses nested agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'complete',
        blocks: [
          {
            type: 'agent',
            agentId: 'child',
            agentName: 'Child',
            agentType: 'child',
            content: '',
            status: 'complete',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toHaveProperty('isCollapsed', true)
    expect((result[0] as AgentContentBlock).blocks![0]).toHaveProperty(
      'isCollapsed',
      true,
    )
  })

  test('collapses tool blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toHaveProperty('isCollapsed', true)
  })

  test('preserves user-opened tool blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
        userOpened: true,
      },
    ]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).not.toHaveProperty('isCollapsed')
  })

  test('leaves regular text blocks unchanged', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const result = autoCollapseBlocks(blocks)
    expect(result[0]).toEqual({ type: 'text', content: 'Hello' })
  })
})

describe('extractSpawnAgentResultContent', () => {
  test('returns string value directly', () => {
    const result = extractSpawnAgentResultContent('Simple result')
    expect(result).toEqual({ content: 'Simple result', hasError: false })
  })

  test('extracts error message', () => {
    const result = extractSpawnAgentResultContent({
      errorMessage: 'Something went wrong',
    })
    expect(result).toEqual({
      content: 'Something went wrong',
      hasError: true,
    })
  })

  test('treats runtime error outputs as errors', () => {
    const result = extractSpawnAgentResultContent({
      type: 'error',
      message: 'Run cancelled by user',
    })

    expect(result).toEqual({
      content: 'Run cancelled by user',
      hasError: true,
    })
  })

  test('treats nested runtime error outputs as errors', () => {
    const result = extractSpawnAgentResultContent({
      agentType: 'editor',
      value: {
        type: 'error',
        message: 'Subagent editor timed out',
      },
    })

    expect(result).toEqual({
      content: 'Subagent editor timed out',
      hasError: true,
    })
  })

  test('extracts nested value string', () => {
    const result = extractSpawnAgentResultContent({
      type: 'lastMessage',
      value: 'Nested value',
    })
    expect(result).toEqual({ content: 'Nested value', hasError: false })
  })

  test('extracts message field', () => {
    const result = extractSpawnAgentResultContent({
      message: 'Message content',
    })
    expect(result).toEqual({ content: 'Message content', hasError: false })
  })

  test('falls back to formatted output for unknown structure', () => {
    const result = extractSpawnAgentResultContent({ unknownField: 123 })
    expect(result.hasError).toBe(false)
    expect(result.content).toContain('unknownField')
  })

  test('handles null value', () => {
    const result = extractSpawnAgentResultContent(null)
    expect(result.hasError).toBe(false)
  })

  test('handles undefined value', () => {
    const result = extractSpawnAgentResultContent(undefined)
    expect(result.hasError).toBe(false)
  })

  test('extracts text from lastMessage output mode with Message array', () => {
    // This is the format returned by agents with outputMode: 'last_message'
    const result = extractSpawnAgentResultContent({
      type: 'lastMessage',
      value: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Here are the research findings:' },
            { type: 'text', text: ' Important information found.' },
          ],
        },
      ],
    })
    expect(result).toEqual({
      content: 'Here are the research findings: Important information found.',
      hasError: false,
    })
  })

  test('extracts text from multiple assistant messages in lastMessage output', () => {
    const result = extractSpawnAgentResultContent({
      type: 'lastMessage',
      value: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'First message' }],
        },
        {
          role: 'tool',
          content: [{ type: 'json', value: {} }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Second message' }],
        },
      ],
    })
    expect(result).toEqual({
      content: 'First message\nSecond message',
      hasError: false,
    })
  })

  test('handles lastMessage with empty content array', () => {
    const result = extractSpawnAgentResultContent({
      type: 'lastMessage',
      value: [
        {
          role: 'assistant',
          content: [],
        },
      ],
    })
    expect(result).toEqual({ content: '', hasError: false })
  })

  test('handles lastMessage with no assistant messages', () => {
    const result = extractSpawnAgentResultContent({
      type: 'lastMessage',
      value: [
        {
          role: 'tool',
          content: [{ type: 'json', value: {} }],
        },
      ],
    })
    expect(result).toEqual({ content: '', hasError: false })
  })

  test('handles allMessages output mode', () => {
    const result = extractSpawnAgentResultContent({
      type: 'allMessages',
      value: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'First response' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Follow up' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Second response' }],
        },
      ],
    })
    expect(result).toEqual({
      content: 'First response\nSecond response',
      hasError: false,
    })
  })

  test('handles structuredOutput with message field', () => {
    const result = extractSpawnAgentResultContent({
      type: 'structuredOutput',
      value: { message: 'Structured output message' },
    })
    expect(result).toEqual({
      content: 'Structured output message',
      hasError: false,
    })
  })

  test('treats structuredOutput error fields as errors', () => {
    const result = extractSpawnAgentResultContent({
      type: 'structuredOutput',
      value: { errorMessage: 'No usable proposal edits' },
    })

    expect(result).toEqual({
      content: 'No usable proposal edits',
      hasError: true,
    })
  })

  test('uses an empty structuredOutput message as no display content', () => {
    const result = extractSpawnAgentResultContent({
      type: 'structuredOutput',
      value: {
        message: '',
        results: [
          {
            stdout: 'Found 1 match\n./file.ts:\nLine 1: needle',
            message: 'Exit code: 0',
          },
        ],
      },
    })

    expect(result).toEqual({ content: '', hasError: false })
  })

  test('formats browser-use structured output as readable text', () => {
    const result = extractSpawnAgentResultContent({
      type: 'structuredOutput',
      value: {
        outputKind: 'browser-use',
        overallStatus: 'partial',
        summary: 'Loaded the page and found one responsive issue.',
        finalUrl: 'http://localhost:3000/',
        finalPageTitle: 'Demo App',
        results: [
          {
            name: 'Initial load',
            passed: true,
            details: 'The landing page rendered.',
            url: 'http://localhost:3000/',
            screenshotAttached: true,
          },
          {
            name: 'PDF export',
            passed: true,
            details: 'The page printed to PDF.',
            pdfAttached: true,
          },
          {
            name: 'Recording',
            passed: true,
            details: 'A short interaction was recorded.',
            recordingAttached: true,
          },
          {
            name: 'Mobile layout',
            passed: false,
            details: 'The header overflowed horizontally.',
          },
        ],
        consoleErrors: [
          {
            message: 'Uncaught example error',
            url: 'http://localhost:3000/',
          },
        ],
        lessons: ['Check mobile header behavior on future runs.'],
      },
    })

    expect(result.hasError).toBe(false)
    expect(result.content).toContain(
      'Browser test partial: Loaded the page and found one responsive issue.',
    )
    expect(result.content).toContain('Final: Demo App — http://localhost:3000/')
    expect(result.content).toContain('✓ Initial load')
    expect(result.content).toContain('screenshot attached')
    expect(result.content).toContain('PDF generated')
    expect(result.content).toContain('recording attached')
    expect(result.content).toContain('✗ Mobile layout')
    expect(result.content).toContain('Console/runtime issues:')
    expect(result.content).not.toContain('"overallStatus"')
  })

  test('does not apply browser-use formatting to generic structured output', () => {
    const result = extractSpawnAgentResultContent({
      type: 'structuredOutput',
      value: {
        overallStatus: 'success',
        summary: 'Generic agent result',
        results: [{ name: 'Step', passed: true }],
      },
    })

    expect(result.hasError).toBe(false)
    expect(result.content).toContain('"overallStatus"')
    expect(result.content).not.toContain('Browser test success')
  })

  test('formats external CLI output with its enforced permission profile', () => {
    const result = extractSpawnAgentResultContent({
      type: 'structuredOutput',
      value: {
        outputKind: 'external-cli',
        permissionProfile: 'tmux-test',
        overallStatus: 'success',
        summary: 'Reviewed the requested change.',
        sessionName: 'cli-review-1',
        results: [
          { name: 'Review', passed: true, details: 'No blockers found.' },
        ],
        scriptIssues: [],
        captures: [],
      },
    })

    expect(result).toEqual({
      content: [
        'External CLI success: Reviewed the requested change.',
        'Permission profile: tmux-test',
        '',
        'Results:',
        '- ✓ Review — No blockers found.',
      ].join('\n'),
      hasError: false,
    })
  })

  test('formats web research structured output as readable findings and sources', () => {
    const result = extractSpawnAgentResultContent({
      type: 'structuredOutput',
      value: {
        questions: [
          {
            question: 'What changed?',
            status: 'answered',
            answer: 'The API changed.',
            citations: ['https://example.com/source'],
          },
        ],
        sources: [
          { url: 'https://example.com/source', title: 'Official source' },
        ],
        skippedQuestions: [],
      },
    })
    expect(result.content).toContain('Web research:')
    expect(result.content).toContain('What changed? [answered]')
    expect(result.content).toContain('Official source')
    expect(result.content).not.toContain('"questions"')
  })

  test('formats documentation research structured output readably', () => {
    const result = extractSpawnAgentResultContent({
      type: 'structuredOutput',
      value: {
        status: 'answered',
        answer: 'Use the stable API.',
        source: 'React',
        version: 'main',
      },
    })
    expect(result.content).toBe(
      'Documentation research answered: React (main)\nUse the stable API.',
    )
  })
})

describe('appendInterruptionNotice', () => {
  test('appends to last text block', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const result = appendInterruptionNotice(blocks)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      type: 'text',
      content: 'Hello\n\n[response interrupted]',
    })
  })

  test('preserves text block fields when appending', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: 'Hello',
        color: 'blue',
        status: 'running',
        thinkingId: 'think-1',
        userOpened: true,
        thinkingCollapseState: 'hidden',
      },
    ]
    const result = appendInterruptionNotice(blocks)
    expect(result[0]).toMatchObject({
      color: 'blue',
      status: 'running',
      thinkingId: 'think-1',
      userOpened: true,
      thinkingCollapseState: 'hidden',
      content: 'Hello\n\n[response interrupted]',
    })
  })

  test('adds new block when last is not text', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
      },
    ]
    const result = appendInterruptionNotice(blocks)
    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({
      type: 'text',
      content: '[response interrupted]',
    })
  })

  test('adds notice to empty blocks array', () => {
    const result = appendInterruptionNotice([])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      type: 'text',
      content: '[response interrupted]',
    })
  })

  test('preserves other blocks when appending to text', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-1',
        toolName: 'read_files',
        input: {},
      },
      { type: 'text', content: 'Some response' },
    ]
    const result = appendInterruptionNotice(blocks)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('tool')
    expect(result[1]).toEqual({
      type: 'text',
      content: 'Some response\n\n[response interrupted]',
    })
  })
})

describe('createAgentBlock', () => {
  test('creates basic agent block with required fields', () => {
    const block = createAgentBlock({
      agentId: 'agent-123',
      agentType: 'file-picker',
    })
    expect(block.type).toBe('agent')
    expect(block.agentId).toBe('agent-123')
    expect(block.agentName).toBe('file-picker')
    expect(block.agentType).toBe('file-picker')
    expect(block.content).toBe('')
    expect(block.status).toBe('running')
    expect(block.blocks).toEqual([])
    expect(block.initialPrompt).toBe('')
  })

  test('includes prompt when provided', () => {
    const block = createAgentBlock({
      agentId: 'agent-123',
      agentType: 'file-picker',
      prompt: 'Find relevant files',
    })
    expect(block.initialPrompt).toBe('Find relevant files')
  })

  test('includes params when provided', () => {
    const block = createAgentBlock({
      agentId: 'agent-123',
      agentType: 'file-picker',
      params: { directories: ['src'] },
    })
    expect(block.params).toEqual({ directories: ['src'] })
  })

  test('uses fallback values for empty agentType', () => {
    const block = createAgentBlock({
      agentId: 'agent-123',
      agentType: '',
    })
    expect(block.agentName).toBe('Agent')
    expect(block.agentType).toBe('unknown')
  })
})

describe('updateBlocksRecursively', () => {
  test('updates target block at top level', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const result = updateBlocksRecursively(blocks, 'agent-1', (block) => ({
      ...block,
      status: 'complete' as const,
    }))
    expect((result[0] as AgentContentBlock).status).toBe('complete')
  })

  test('updates nested block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'child',
            agentName: 'Child',
            agentType: 'child',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = updateBlocksRecursively(blocks, 'child', (block) => ({
      ...block,
      status: 'complete' as const,
    }))
    expect((result[0] as AgentContentBlock).blocks![0]).toMatchObject({
      status: 'complete',
    })
  })

  test('returns original array if target not found', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const result = updateBlocksRecursively(
      blocks,
      'nonexistent',
      (block) => block,
    )
    expect(result).toBe(blocks)
  })

  test('handles deeply nested blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'level-1',
        agentName: 'L1',
        agentType: 'l1',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'level-2',
            agentName: 'L2',
            agentType: 'l2',
            content: '',
            status: 'running',
            blocks: [
              {
                type: 'agent',
                agentId: 'level-3',
                agentName: 'L3',
                agentType: 'l3',
                content: '',
                status: 'running',
                blocks: [],
                initialPrompt: '',
              },
            ],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = updateBlocksRecursively(blocks, 'level-3', (block) => ({
      ...block,
      content: 'updated',
    }))
    const level1 = result[0] as AgentContentBlock
    const level2 = level1.blocks![0] as AgentContentBlock
    const level3 = level2.blocks![0] as AgentContentBlock
    expect(level3.content).toBe('updated')
  })
})

describe('nestBlockUnderParent', () => {
  test('nests block under existing parent', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const childBlock: ContentBlock = { type: 'text', content: 'Child content' }
    const { blocks: result, parentFound } = nestBlockUnderParent(
      blocks,
      'parent',
      childBlock,
    )
    expect(parentFound).toBe(true)
    expect((result[0] as AgentContentBlock).blocks).toHaveLength(1)
    expect((result[0] as AgentContentBlock).blocks![0]).toEqual(childBlock)
  })

  test('returns parentFound false when parent not found', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const childBlock: ContentBlock = { type: 'text', content: 'Child' }
    const { blocks: result, parentFound } = nestBlockUnderParent(
      blocks,
      'nonexistent',
      childBlock,
    )
    expect(parentFound).toBe(false)
    expect(result).toBe(blocks)
  })

  test('appends to existing blocks in parent', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [{ type: 'text', content: 'Existing' }],
        initialPrompt: '',
      },
    ]
    const childBlock: ContentBlock = { type: 'text', content: 'New child' }
    const { blocks: result, parentFound } = nestBlockUnderParent(
      blocks,
      'parent',
      childBlock,
    )
    expect(parentFound).toBe(true)
    expect((result[0] as AgentContentBlock).blocks).toHaveLength(2)
    expect((result[0] as AgentContentBlock).blocks![1]).toEqual(childBlock)
  })

  test('nests under deeply nested parent', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'grandparent',
        agentName: 'GP',
        agentType: 'gp',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'parent',
            agentName: 'Parent',
            agentType: 'parent',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const childBlock: ContentBlock = { type: 'text', content: 'Nested child' }
    const { blocks: result, parentFound } = nestBlockUnderParent(
      blocks,
      'parent',
      childBlock,
    )
    expect(parentFound).toBe(true)
    const grandparent = result[0] as AgentContentBlock
    const parent = grandparent.blocks![0] as AgentContentBlock
    expect(parent.blocks).toHaveLength(1)
    expect(parent.blocks![0]).toEqual(childBlock)
  })
})

describe('moveSpawnAgentBlock', () => {
  test('replaces temp agent id with real id', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'temp',
        agentName: 'Temp',
        agentType: 'temp',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const result = moveSpawnAgentBlock(blocks, 'temp', 'real')
    expect((result[0] as AgentContentBlock).agentId).toBe('real')
  })

  test('nests extracted block under parent when found', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'temp',
            agentName: 'Temp',
            agentType: 'temp',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = moveSpawnAgentBlock(blocks, 'temp', 'real', 'parent')
    const parent = result[0] as AgentContentBlock
    expect(parent.blocks).toHaveLength(1)
    expect((parent.blocks![0] as AgentContentBlock).agentId).toBe('real')
  })

  test('updates in place when parent missing to preserve order', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'temp',
        agentName: 'Temp',
        agentType: 'temp',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
      { type: 'text', content: 'other' },
    ]
    const result = moveSpawnAgentBlock(blocks, 'temp', 'real', 'missing')
    // Block should stay in its original position (index 0), not move to end
    expect(result[0]).toMatchObject({ type: 'agent', agentId: 'real' })
    expect(result[1]).toMatchObject({ type: 'text', content: 'other' })
  })

  test('preserves block order when multiple agents resolve out of order', () => {
    // Simulate spawn_agents creating 3 placeholder blocks in order
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'toolcall-0',
        agentName: 'Agent A',
        agentType: 'file-picker',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
      {
        type: 'agent',
        agentId: 'toolcall-1',
        agentName: 'Agent B',
        agentType: 'code-searcher',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
      {
        type: 'agent',
        agentId: 'toolcall-2',
        agentName: 'Agent C',
        agentType: 'commander',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]

    // Agents resolve in different order: C first, then A, then B
    let result = moveSpawnAgentBlock(blocks, 'toolcall-2', 'real-c')
    result = moveSpawnAgentBlock(result, 'toolcall-0', 'real-a')
    result = moveSpawnAgentBlock(result, 'toolcall-1', 'real-b')

    // Order should be preserved: A, B, C
    expect(result[0]).toMatchObject({ agentId: 'real-a' })
    expect(result[1]).toMatchObject({ agentId: 'real-b' })
    expect(result[2]).toMatchObject({ agentId: 'real-c' })
  })
})

describe('extractBlockById', () => {
  test('extracts block from top level', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Keep me' },
      {
        type: 'agent',
        agentId: 'extract-me',
        agentName: 'Extract',
        agentType: 'extract',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: '',
      },
    ]
    const { remainingBlocks, extractedBlock } = extractBlockById(
      blocks,
      'extract-me',
    )
    expect(remainingBlocks).toHaveLength(1)
    expect(remainingBlocks[0].type).toBe('text')
    expect(extractedBlock).not.toBeNull()
    expect((extractedBlock as AgentContentBlock).agentId).toBe('extract-me')
  })

  test('returns null when block not found', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const { remainingBlocks, extractedBlock } = extractBlockById(
      blocks,
      'nonexistent',
    )
    expect(remainingBlocks).toHaveLength(1)
    expect(extractedBlock).toBeNull()
  })

  test('extracts from nested blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'nested-child',
            agentName: 'Child',
            agentType: 'child',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
        ],
        initialPrompt: '',
      },
    ]
    const { remainingBlocks, extractedBlock } = extractBlockById(
      blocks,
      'nested-child',
    )
    expect((remainingBlocks[0] as AgentContentBlock).blocks).toHaveLength(0)
    expect(extractedBlock).not.toBeNull()
    expect((extractedBlock as AgentContentBlock).agentId).toBe('nested-child')
  })

  test('handles empty blocks array', () => {
    const { remainingBlocks, extractedBlock } = extractBlockById([], 'any-id')
    expect(remainingBlocks).toHaveLength(0)
    expect(extractedBlock).toBeNull()
  })

  test('preserves non-matching nested structure', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'parent',
        agentName: 'Parent',
        agentType: 'parent',
        content: '',
        status: 'running',
        blocks: [
          { type: 'text', content: 'Keep this' },
          {
            type: 'agent',
            agentId: 'extract-me',
            agentName: 'Extract',
            agentType: 'extract',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: '',
          },
          { type: 'text', content: 'Keep this too' },
        ],
        initialPrompt: '',
      },
    ]
    const { remainingBlocks, extractedBlock } = extractBlockById(
      blocks,
      'extract-me',
    )
    const parentBlock = remainingBlocks[0] as AgentContentBlock
    expect(parentBlock.blocks).toHaveLength(2)
    expect((parentBlock.blocks![0] as TextContentBlock).content).toBe(
      'Keep this',
    )
    expect((parentBlock.blocks![1] as TextContentBlock).content).toBe(
      'Keep this too',
    )
    expect(extractedBlock).not.toBeNull()
  })
})

describe('transformAskUserBlocks', () => {
  test('transforms ask_user tool block to ask-user block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'ask_user',
        input: {
          questions: [
            { question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] },
          ],
        },
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: { answers: [{ questionIndex: 0, selectedOption: 'A' }] },
    })
    expect(result[0].type).toBe('ask-user')
    const askUserBlock = result[0] as AskUserContentBlock
    expect(askUserBlock.answers).toEqual([
      { questionIndex: 0, selectedOption: 'A' },
    ])
    expect(askUserBlock.questions).toEqual([
      { question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] },
    ])
  })

  test('transforms skipped ask_user block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'ask_user',
        input: {
          questions: [
            { question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] },
          ],
        },
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: { skipped: true },
    })
    expect(result[0].type).toBe('ask-user')
    expect((result[0] as AskUserContentBlock).skipped).toBe(true)
  })

  test('keeps tool block when no result data', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'ask_user',
        input: { questions: [] },
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: {},
    })
    expect(result[0].type).toBe('tool')
  })

  test('does not transform non-matching tool', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'ask_user',
        input: { questions: [] },
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'different-id',
      resultValue: { answers: [{ questionIndex: 0, selectedOption: 'A' }] },
    })
    expect(result[0].type).toBe('tool')
  })

  test('transforms nested ask_user in agent blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'tool',
            toolCallId: 'tool-123',
            toolName: 'ask_user',
            input: { questions: [{ question: 'Q?' }] },
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: { answers: ['Yes'] },
    })
    expect((result[0] as AgentContentBlock).blocks![0].type).toBe('ask-user')
  })

  test('returns same reference when nothing changes', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const result = transformAskUserBlocks(blocks, {
      toolCallId: 'tool-123',
      resultValue: { answers: [{ questionIndex: 0, selectedOption: 'A' }] },
    })
    expect(result[0]).toBe(blocks[0])
  })
})

describe('updateToolBlockWithOutput', () => {
  test('updates tool block with formatted output', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'read_files',
        input: { paths: ['file.ts'] },
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput: [{ type: 'text', value: 'file contents' }],
    })
    expect((result[0] as ToolContentBlock).output).toBeDefined()
  })

  test('formats terminal command output specially', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'run_terminal_command',
        input: { command: 'echo hi' },
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput: [{ value: { stdout: 'hi\n', stderr: '' } }],
    })
    expect((result[0] as ToolContentBlock).output).toBe('hi\n')
  })

  test('combines stdout and stderr for terminal commands', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'run_terminal_command',
        input: { command: 'cmd' },
      },
    ]
    const toolOutput = [{ value: { stdout: 'out', stderr: 'err' } }]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput,
    })
    expect((result[0] as ToolContentBlock).output).toBe('outerr')
    expect((result[0] as ToolContentBlock).outputRaw).toBe(toolOutput)
  })

  test('redacts media payloads from live tool output state', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-image',
        toolName: 'read_image',
        input: { paths: ['current.png'] },
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-image',
      toolOutput: [
        {
          type: 'json',
          value: {
            images: [{ path: 'current.png', status: 'attached' }],
          },
        },
        {
          type: 'media',
          data: 'a'.repeat(100_000),
          mediaType: 'image/png',
        },
      ],
    })
    const toolBlock = result[0] as ToolContentBlock

    expect(toolBlock.output).toContain('mediaRedacted')
    expect(toolBlock.output).toContain('100000 base64 chars')
    expect(toolBlock.output).not.toContain('a'.repeat(1_000))
    expect(JSON.stringify(toolBlock.outputRaw)).not.toContain('a'.repeat(1_000))
  })

  test('summarizes edit_transaction output without dumping patches', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'edit_transaction',
        input: { edits: [{ id: 'edit-a', path: 'src/a.ts' }] },
      },
    ]
    const toolOutput = [
      {
        type: 'json',
        value: {
          message: 'Atomic edit_transaction prepared 2 file change(s).',
          files: [
            { path: 'src/a.ts', patch: '@@ huge patch A' },
            { path: 'src/b.ts', patch: '@@ huge patch B' },
          ],
        },
      },
    ]

    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput,
    })
    const toolBlock = result[0] as ToolContentBlock

    expect(toolBlock.output).toBe(
      'Atomic edit_transaction prepared 2 file change(s).\n- src/a.ts\n- src/b.ts',
    )
    expect(toolBlock.output).not.toContain('huge patch')
    expect(toolBlock.outputRaw).toBe(toolOutput)
  })

  test('summarizes failed edit_transaction output', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'edit_transaction',
        input: { edits: [] },
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput: [
        {
          type: 'json',
          value: {
            errorMessage: 'Atomic edit_transaction aborted.',
            failures: [],
          },
        },
      ],
    })

    expect((result[0] as ToolContentBlock).output).toBe(
      'Atomic edit_transaction aborted.',
    )
  })

  test('does not update non-matching tool block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'tool-123',
        toolName: 'read_files',
        input: {},
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'different-id',
      toolOutput: [{ value: 'output' }],
    })
    expect((result[0] as ToolContentBlock).output).toBeUndefined()
  })

  test('updates nested tool blocks in agent', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'tool',
            toolCallId: 'tool-123',
            toolName: 'read_files',
            input: {},
          },
        ],
        initialPrompt: '',
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'tool-123',
      toolOutput: [{ type: 'text', value: 'contents' }],
    })
    expect(
      ((result[0] as AgentContentBlock).blocks![0] as ToolContentBlock).output,
    ).toBeDefined()
  })

  test('returns same reference for unchanged nested blocks', () => {
    const nestedBlocks: ContentBlock[] = [{ type: 'text', content: 'Hello' }]
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'agent-1',
        agentName: 'Test',
        agentType: 'test',
        content: '',
        status: 'running',
        blocks: nestedBlocks,
        initialPrompt: '',
      },
    ]
    const result = updateToolBlockWithOutput(blocks, {
      toolCallId: 'non-existent',
      toolOutput: [],
    })
    expect(result[0]).toBe(blocks[0])
  })
})

describe('parseGateStateBlock', () => {
  test('parses a well-formed pinned Base2 gate-state block', () => {
    const buffer = [
      'Some prose.',
      '<gate-state>',
      'gate: ci',
      'status: passed',
      'details: All checks green',
      '</gate-state>',
      'More prose.',
    ].join('\n')
    expect(parseGateStateBlock(buffer)).toEqual({
      type: 'gate-state',
      gate: 'ci',
      gateStatus: 'passed',
      details: 'All checks green',
      origin: 'Base2',
    })
  })

  test('honors an explicit origin label and is case-insensitive on keys', () => {
    const buffer = [
      '<gate-state>',
      'Gate: release',
      'STATUS: failed',
      'Origin: Promotion',
      '</gate-state>',
    ].join('\n')
    expect(parseGateStateBlock(buffer)).toEqual({
      type: 'gate-state',
      gate: 'release',
      gateStatus: 'failed',
      origin: 'Promotion',
    })
  })

  test('returns null when status is unrecognized', () => {
    const buffer = [
      '<gate-state>',
      'gate: ci',
      'status: maybe',
      '</gate-state>',
    ].join('\n')
    expect(parseGateStateBlock(buffer)).toBeNull()
  })

  test('returns null for ordinary prose mentioning gate/status', () => {
    expect(
      parseGateStateBlock(
        'The release gate is currently in a pending status while we wait.',
      ),
    ).toBeNull()
  })

  test('returns null when required fields are missing', () => {
    expect(
      parseGateStateBlock('<gate-state>status: passed</gate-state>'),
    ).toBeNull()
    expect(parseGateStateBlock('<gate-state>gate: ci</gate-state>')).toBeNull()
  })

  test('scrubGateStateTags removes the pinned block and collapses blank runs', () => {
    const buffer = [
      'Hello.',
      '',
      '<gate-state>',
      'gate: ci',
      'status: passed',
      '</gate-state>',
      '',
      '',
      'World.',
    ].join('\n')
    const scrubbed = scrubGateStateTags(buffer)
    expect(scrubbed).not.toContain('<gate-state>')
    expect(scrubbed).toContain('Hello.')
    expect(scrubbed).toContain('World.')
    expect(scrubbed).not.toMatch(/\n{3,}/)
  })

  test('parses only the first of multiple gate-state blocks', () => {
    const buffer = [
      '<gate-state>',
      'gate: first',
      'status: passed',
      '</gate-state>',
      '<gate-state>',
      'gate: second',
      'status: failed',
      '</gate-state>',
    ].join('\n')
    expect(parseGateStateBlock(buffer)).toEqual({
      type: 'gate-state',
      gate: 'first',
      gateStatus: 'passed',
      origin: 'Base2',
    })
  })

  test('parses a skipped gate with details and default origin', () => {
    const buffer = [
      '<gate-state>',
      'gate: security',
      'status: skipped',
      'details: No security-sensitive files matched',
      '</gate-state>',
    ].join('\n')
    expect(parseGateStateBlock(buffer)).toEqual({
      type: 'gate-state',
      gate: 'security',
      gateStatus: 'skipped',
      details: 'No security-sensitive files matched',
      origin: 'Base2',
    })
  })

  test('ignores lines that do not match the key:value shape', () => {
    const buffer = [
      '<gate-state>',
      'arbitrary prose without a separator',
      'gate: ci',
      'status: pending',
      ':extraneous',
      '</gate-state>',
    ].join('\n')
    expect(parseGateStateBlock(buffer)).toEqual({
      type: 'gate-state',
      gate: 'ci',
      gateStatus: 'pending',
      origin: 'Base2',
    })
  })

  test('scrubGateStateTags handles buffers with no gate-state blocks', () => {
    expect(scrubGateStateTags('Nothing to scrub')).toBe('Nothing to scrub')
  })
})

describe('isGateStateBlock', () => {
  test('identifies a gate-state content block', () => {
    const block: ContentBlock = {
      type: 'gate-state',
      gate: 'ci',
      gateStatus: 'passed',
    }
    expect(isGateStateBlock(block)).toBe(true)
  })

  test('rejects non-gate-state blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'hello' },
      { type: 'plan', content: 'Plan' },
    ]
    expect(isGateStateBlock(blocks[0])).toBe(false)
    expect(isGateStateBlock(blocks[1])).toBe(false)
  })
})
