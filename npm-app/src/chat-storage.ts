import * as path from 'path'
import * as fs from 'fs'
import { Message } from 'common/actions'
import {
  getExistingFiles,
  getCurrentChatDir,
  currentChatId,
} from './project-files'
import { ensureDirectoryExists } from 'common/util/file'

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

      // Helper function to clean up content string
      const cleanContent = (content: string) => {
        let result = content
        if (content.includes('"logs"')) {
          result = result.replace(
            /"logs"\s*:\s*\[[^\]]*\]/g,
            '"logs":[LOGS_REMOVED]'
          )
        }
        return result
      }

      // Clean up message content
      if (!msg.content) return msg

      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content
            .filter(contentObj => contentObj.type !== 'image')
            .map((contentObj) => {
              if (contentObj.type === 'tool_result' && contentObj.content) {
                return {
                  ...contentObj,
                  content: cleanContent(contentObj.content),
                }
              }
              return contentObj
            }),
        }
      } else if (typeof msg.content === 'string') {
        return {
          ...msg,
          content: cleanContent(msg.content),
        }
      }
      return msg
    })

    // Add the new message
    chat.messages.push(message)
    chat.updatedAt = new Date().toISOString()

    // Save messages to .codebuff/messages/messages.json
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
