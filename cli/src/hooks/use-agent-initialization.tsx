import os from 'os'
import path from 'path'

import { useEffect } from 'react'

import { TerminalLink } from '../components/terminal-link'
import { createValidationErrorBlocks } from '../utils/create-validation-error-blocks'
import { openFileAtPath } from '../utils/open-file'

import type { ChatMessage, ContentBlock } from '../types/chat'
import type { ChatTheme } from '../types/theme-system'

interface UseAgentInitializationOptions {
  loadedAgentsData: {
    agents: Array<{ id: string; displayName: string }>
    agentsDir: string
  } | null
  validationErrors: Array<{ id: string; message: string }>
  logoBlock: string
  theme: ChatTheme
  separatorWidth: number
  agentId?: string
  resolvedThemeName: string
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setCollapsedAgents: React.Dispatch<React.SetStateAction<Set<string>>>
}

export const useAgentInitialization = ({
  loadedAgentsData,
  validationErrors,
  logoBlock,
  theme,
  separatorWidth,
  agentId,
  resolvedThemeName,
  messages,
  setMessages,
  setCollapsedAgents,
}: UseAgentInitializationOptions) => {
  // Update logo when terminal width changes
  useEffect(() => {
    if (messages.length > 0) {
      const systemMessage = messages.find((m) =>
        m.id.startsWith('system-loaded-agents-'),
      )
      if (systemMessage?.blocks) {
        const logoBlockIndex = systemMessage.blocks.findIndex(
          (b) => b.type === 'text' && b.content.includes('█'),
        )
        if (logoBlockIndex !== -1) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === systemMessage.id) {
                const newBlocks = [...msg.blocks!]
                newBlocks[logoBlockIndex] = {
                  type: 'text',
                  content: '\n\n' + logoBlock,
                }
                return { ...msg, blocks: newBlocks }
              }
              return msg
            }),
          )
        }
      }
    }
  }, [logoBlock])

  // Initialize and update loaded agents message when theme changes
  useEffect(() => {
    if (!loadedAgentsData) {
      return
    }

    const agentListId = 'loaded-agents-list'
    const baseTextColor = theme.foreground

    const homeDir = os.homedir()
    const repoRoot = path.dirname(loadedAgentsData.agentsDir)
    const relativePath = path.relative(homeDir, repoRoot)
    const displayPath = relativePath.startsWith('..')
      ? repoRoot
      : `~/${relativePath}`

    const buildBlocks = (listId: string): ContentBlock[] => {
      const blocks: ContentBlock[] = [
        {
          type: 'text',
          content: logoBlock,
          color: theme.foreground,
          marginBottom: 1,
          marginTop: 2,
        },
      ]

      blocks.push({
        type: 'html',
        render: () => {
          return (
            <box>
              <text style={{ wrapMode: 'word', marginBottom: 1 }}>
                <span fg={baseTextColor}>
                  Codebuff will run commands on your behalf to help you build.
                </span>
              </text>
              <text style={{ wrapMode: 'word', marginBottom: 1 }}>
                <span fg={baseTextColor}>
                  Directory{' '}
                  <TerminalLink
                    text={displayPath}
                    inline={true}
                    underlineOnHover={true}
                    onActivate={() => openFileAtPath(repoRoot)}
                  />
                </span>
              </text>
            </box>
          )
        },
      })

      blocks.push({
        type: 'agent-list',
        id: listId,
        agents: loadedAgentsData.agents,
        agentsDir: loadedAgentsData.agentsDir,
      })

      return blocks
    }

    if (messages.length === 0) {
      const initialBlocks = buildBlocks(agentListId)
      const initialMessage: ChatMessage = {
        id: `system-loaded-agents-${Date.now()}`,
        variant: 'ai',
        content: '',
        blocks: initialBlocks,
        timestamp: new Date().toISOString(),
      }

      setCollapsedAgents((prev) => new Set([...prev, agentListId]))

      const messagesToAdd: ChatMessage[] = [initialMessage]

      if (validationErrors.length > 0) {
        const errorBlocks = createValidationErrorBlocks({
          errors: validationErrors,
          loadedAgentsData,
          availableWidth: separatorWidth,
        })

        const validationErrorMessage: ChatMessage = {
          id: `validation-error-${Date.now()}`,
          variant: 'error',
          content: '',
          blocks: errorBlocks,
          timestamp: new Date().toISOString(),
        }

        messagesToAdd.push(validationErrorMessage)
      }

      setMessages(messagesToAdd)
      return
    }

    setMessages((prev) => {
      if (prev.length === 0) {
        return prev
      }

      const [firstMessage, ...rest] = prev
      if (!firstMessage.blocks) {
        return prev
      }

      const agentListBlock = firstMessage.blocks.find(
        (block): block is Extract<ContentBlock, { type: 'agent-list' }> =>
          block.type === 'agent-list',
      )

      if (!agentListBlock) {
        return prev
      }

      const updatedBlocks = buildBlocks(agentListBlock.id)

      return [
        {
          ...firstMessage,
          blocks: updatedBlocks,
        },
        ...rest,
      ]
    })
  }, [
    agentId,
    loadedAgentsData,
    logoBlock,
    resolvedThemeName,
    separatorWidth,
    theme,
    validationErrors,
    messages.length,
  ])
}
