import { describe, expect, mock, test } from 'bun:test'

import { exportConversation } from '../export-conversation'
import { IS_FREEBUFF } from '../../utils/constants'

import type { ExportDeps } from '../export-conversation'
import type { ChatMessage, ContentBlock } from '../../types/chat'

// The default filename prefix follows the product branding, like the
// transcript header in serializeConversation.
const PRODUCT = IS_FREEBUFF ? 'freebuff' : 'codebuff'

const msg = (
  variant: ChatMessage['variant'],
  opts: { content?: string; blocks?: ContentBlock[] } = {},
): ChatMessage => ({
  id: `${variant}-${opts.content ?? 'x'}`,
  variant,
  content: opts.content ?? '',
  blocks: opts.blocks,
  timestamp: '2026-06-25T00:00:00.000Z',
})

const makeDeps = () => {
  const writes: Array<{ filePath: string; data: string }> = []
  const deps: ExportDeps = {
    getProjectRoot: () => '/project',
    getCurrentChatId: () => '2026-06-25T00-00-00.000Z',
    fileExists: () => false,
    writeFile: async (filePath, data) => {
      writes.push({ filePath, data })
    },
  }
  return { deps, writes }
}

describe('exportConversation', () => {
  test('defaults to <product>-chat-<chatId>.md in the project root', async () => {
    const { deps, writes } = makeDeps()
    const result = await exportConversation(
      [msg('user', { content: 'hi' })],
      '',
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      filePath: `/project/${PRODUCT}-chat-2026-06-25T00-00-00.000Z.md`,
      format: 'markdown',
    })
    expect(writes).toHaveLength(1)
    expect(writes[0].data).toContain('## User')
    expect(writes[0].data).toContain('hi')
  })

  test('resolves a relative filename against the project root', async () => {
    const { deps, writes } = makeDeps()
    const result = await exportConversation(
      [msg('user', { content: 'hi' })],
      ' notes/chat.md ',
      deps,
    )
    expect(result).toMatchObject({
      ok: true,
      filePath: '/project/notes/chat.md',
    })
    expect(writes[0].filePath).toBe('/project/notes/chat.md')
  })

  test('refuses a path that escapes the project root', async () => {
    const { deps, writes } = makeDeps()
    // path.resolve honors both of these; without the containment check they
    // reach anything on disk.
    for (const escape of ['../outside.md', '/etc/hosts']) {
      const result = await exportConversation(
        [msg('user', { content: 'hi' })],
        escape,
        deps,
      )
      expect(result).toMatchObject({ ok: false })
      if (!result.ok) expect(result.error).toContain('project root')
    }
    expect(writes).toHaveLength(0)
  })

  test('refuses to overwrite an existing file', async () => {
    const { deps, writes } = makeDeps()
    deps.fileExists = () => true
    // The atomic write renames over the target, so '/export README.md' would
    // otherwise destroy the file with no prompt and no backup.
    const result = await exportConversation(
      [msg('user', { content: 'hi' })],
      'README.md',
      deps,
    )
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('already exists')
    expect(writes).toHaveLength(0)
  })

  test('a .json filename exports the raw messages as parseable JSON', async () => {
    const { deps, writes } = makeDeps()
    const messages = [msg('user', { content: 'hello json' })]
    const result = await exportConversation(messages, 'out.json', deps)

    expect(result).toMatchObject({ ok: true, format: 'json' })
    const parsed = JSON.parse(writes[0].data)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].content).toBe('hello json')
  })

  test('.json export survives cyclic tool output instead of throwing', async () => {
    const { deps, writes } = makeDeps()
    const cyclic: Record<string, unknown> = { note: 'loop' }
    cyclic.self = cyclic
    const messages = [
      msg('ai', {
        blocks: [
          {
            type: 'tool',
            toolCallId: 'call-1',
            toolName: 'read_files' as never,
            input: cyclic,
            output: 'ok',
          },
        ],
      }),
    ]

    const result = await exportConversation(messages, 'out.json', deps)
    expect(result).toMatchObject({ ok: true, format: 'json' })
    expect(writes[0].data).toContain('[Circular]')
  })

  test('markdown export has no clipboard ceiling — nothing is trimmed', async () => {
    const { deps, writes } = makeDeps()
    // Far past the /copy OSC 52 budget (22 KB); with a maxBytes this would be
    // replaced by an omission note.
    const huge = 'x'.repeat(200_000)
    const messages = [
      msg('ai', {
        blocks: [
          {
            type: 'tool',
            toolCallId: 'call-1',
            toolName: 'read_files' as never,
            input: { path: 'big.txt' },
            output: huge,
          },
        ],
      }),
    ]

    const result = await exportConversation(messages, '', deps)
    expect(result).toMatchObject({ ok: true })
    expect(writes[0].data).toContain(huge)
    expect(writes[0].data).not.toContain('omitted')
  })

  test('reports write failures instead of throwing', async () => {
    const { deps } = makeDeps()
    deps.writeFile = mock(async () => {
      throw new Error('EACCES: permission denied')
    })
    const result = await exportConversation(
      [msg('user', { content: 'hi' })],
      '',
      deps,
    )
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('EACCES')
  })

  test('reports a missing project root instead of throwing', async () => {
    const { deps } = makeDeps()
    deps.getProjectRoot = () => {
      throw new Error('Project root not set')
    }
    const result = await exportConversation(
      [msg('user', { content: 'hi' })],
      '',
      deps,
    )
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('Project root not set')
  })
})
