import { describe, expect, test } from 'bun:test'

describe('/new command', () => {
  test('rotates the chat id so the previous chat is not overwritten', () => {
    const commandRegistryUrl = new URL(
      '../command-registry.ts',
      import.meta.url,
    ).href
    const projectFilesUrl = new URL(
      '../../project-files.ts',
      import.meta.url,
    ).href
    const activeRunUrl = new URL(
      '../../utils/active-run.ts',
      import.meta.url,
    ).href

    const result = Bun.spawnSync({
      cmd: [
        'bun',
        '--eval',
        `
          import { findCommand } from ${JSON.stringify(commandRegistryUrl)}
          import { getCurrentChatId, setCurrentChatId } from ${JSON.stringify(projectFilesUrl)}
          import { setActiveRunAborter } from ${JSON.stringify(activeRunUrl)}

          setCurrentChatId('previous-chat-id')

          // Simulate an in-flight run: record which chat was current when the
          // abort fired.
          let abortedAtChatId = null
          setActiveRunAborter('run-1', () => {
            abortedAtChatId = getCurrentChatId()
          })

          const newCommand = findCommand('new')
          if (!newCommand) throw new Error('new command missing')

          const noop = () => {}
          newCommand.handler(
            {
              setMessages: noop,
              clearMessages: noop,
              saveToHistory: noop,
              inputValue: '/new',
              setInputValue: noop,
              stopStreaming: noop,
              setCanProcessQueue: noop,
            },
            '',
          )

          if (getCurrentChatId() === 'previous-chat-id') {
            throw new Error(
              '/new did not rotate the chat id — the next save would overwrite the previous chat',
            )
          }

          if (abortedAtChatId === null) {
            throw new Error(
              '/new did not abort the in-flight run — an orphaned run would keep checkpointing across the chat switch',
            )
          }
          if (abortedAtChatId !== 'previous-chat-id') {
            throw new Error(
              '/new aborted the run only after rotating the chat id — late writes could land in the new chat',
            )
          }
        `,
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
        NEXT_PUBLIC_CODEBUFF_APP_URL: 'https://app.codebuff.test',
        NEXT_PUBLIC_SUPPORT_EMAIL: 'support@codebuff.test',
        NEXT_PUBLIC_POSTHOG_API_KEY: 'phc_test_key',
        NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.codebuff.test',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
        NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: 'https://stripe.codebuff.test',
        NEXT_PUBLIC_WEB_PORT: '3000',
      },
      stderr: 'pipe',
      stdout: 'pipe',
    })

    const stderr = new TextDecoder().decode(result.stderr)
    expect(result.exitCode, stderr).toBe(0)
  })
})
