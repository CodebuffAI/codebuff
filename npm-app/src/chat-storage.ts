import * as path from 'path'
import * as fs from 'fs'
import { Message } from 'common/types/message'
import {
  getExistingFiles,
  getCurrentChatDir,
  currentChatId,
} from './project-files'
import { transformJsonInString } from 'common/util/string'
import { type Log } from 'common/browser-actions'
import { match, P } from 'ts-pattern'

interface Chat {
  id: string
  messages: Message[]
  fileVersions: FileVersion[]
  createdAt: string
  updatedAt: string
  timestamp: number // Unix timestamp in milliseconds
}

interface FileVersion {
  files: Record<string, string>
}

export class ChatStorage {
  private currentChat: Chat
  private currentVersionIndex: number

  constructor() {
    this.currentChat = this.createChat()
    this.currentVersionIndex = -1
  }

  getCurrentChat(): Chat {
    return this.currentChat
  }

  addMessage(chat: Chat, message: Message) {
    // Before adding new message, clean up any screenshots and logs in previous messages
    // Skip the last message as it may not have been processed by the backend yet
    const lastIndex = chat.messages.length - 1
    chat.messages = chat.messages.map((msg, index) => {
      if (index === lastIndex) {
        return msg // Preserve the most recent message in its entirety
      }

      // Helper function to clean up message content
      const cleanContent = (content: string) => {
        // Keep only tool logs
        content = transformJsonInString<Array<Log>>(
          content,
          'logs',
          (logs) => logs.filter((log) => log.source === 'tool'),
          '(LOGS_REMOVED)'
        )

        // Remove metrics
        content = transformJsonInString(
          content,
          'metrics',
          () => '(METRICS_REMOVED)',
          '(METRICS_REMOVED)'
        )

        return content
      }

      // Clean up message content
      if (!msg.content) return msg

      return match(msg)
        .with({ content: P.array() }, (message) => ({
          ...message,
          content: message.content.reduce<typeof message.content>(
            (acc, contentObj) => [
              ...acc,
              ...match(contentObj)
                .with({ type: 'tool_result', content: P.string }, (obj) => [
                  {
                    ...obj,
                    content: cleanContent(obj.content),
                  },
                ])
                .with({ type: 'text', text: P.string }, (obj) => [
                  {
                    ...obj,
                    text: cleanContent(obj.text),
                  },
                ])
                .otherwise((obj) => [obj]),
            ],
            []
          ),
        }))
        .with({ content: P.string }, (message) => ({
          ...message,
          content: cleanContent(message.content),
        }))
        .otherwise((message) => message)
    })

    // Add the new message
    chat.messages.push(message)
    chat.updatedAt = new Date().toISOString()

    // Save messages to chat directory
    this.saveMessagesToFile(chat)
  }

  private saveMessagesToFile(chat: Chat) {
    try {
      const chatDir = getCurrentChatDir()
      const messagesPath = path.join(chatDir, 'messages.json')

      const messagesData = {
        id: chat.id,
        messages: chat.messages,
        updatedAt: chat.updatedAt,
      }

      fs.writeFileSync(messagesPath, JSON.stringify(messagesData, null, 2))
    } catch (error) {
      console.error('Failed to save messages to file:', error)
    }
  }

  getCurrentVersion(): FileVersion | null {
    if (
      this.currentVersionIndex >= 0 &&
      this.currentVersionIndex < this.currentChat.fileVersions.length
    ) {
      return this.currentChat.fileVersions[this.currentVersionIndex]
    }
    return null
  }

  navigateVersion(direction: 'undo' | 'redo'): boolean {
    if (direction === 'undo' && this.currentVersionIndex >= 0) {
      this.currentVersionIndex--
      return true
    } else if (
      direction === 'redo' &&
      this.currentVersionIndex < this.currentChat.fileVersions.length - 1
    ) {
      this.currentVersionIndex++
      return true
    }
    return false
  }

  saveFilesChanged(filesChanged: string[]) {
    let currentVersion = this.getCurrentVersion()
    if (!currentVersion) {
      this.addNewFileState({})
      currentVersion = this.getCurrentVersion() as FileVersion
    }
    const newFilesChanged = filesChanged.filter((f) => !currentVersion.files[f])
    const updatedFiles = getExistingFiles(newFilesChanged)
    currentVersion.files = { ...currentVersion.files, ...updatedFiles }
    return Object.keys(currentVersion.files)
  }

  saveCurrentFileState(files: Record<string, string>) {
    const currentVersion = this.getCurrentVersion()
    if (currentVersion) {
      currentVersion.files = files
    } else {
      this.addNewFileState(files)
    }
  }

  addNewFileState(files: Record<string, string>) {
    const newVersion: FileVersion = {
      files,
    }
    this.currentChat.fileVersions.push(newVersion)
    this.currentVersionIndex = this.currentChat.fileVersions.length - 1
  }

  private createChat(messages: Message[] = []): Chat {
    const now = new Date()
    const chat: Chat = {
      id: currentChatId,
      messages,
      fileVersions: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      timestamp: now.getTime(),
    }
    return chat
  }
}
