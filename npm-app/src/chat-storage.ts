import * as path from 'path'
import * as fs from 'fs'
import { Message } from 'common/actions'
import { getExistingFiles, getDebugDir } from './project-files'
import { ensureDirectoryExists } from 'common/util/file'

const CHATS_DIR = 'chats'

interface Chat {
  id: string
  messages: Message[]
  fileVersions: FileVersion[]
  createdAt: string
  updatedAt: string
}

interface FileVersion {
  files: Record<string, string>
}

export class ChatStorage {
  private baseDir: string
  private currentChat: Chat
  private currentVersionIndex: number

  constructor() {
    this.baseDir = getDebugDir(CHATS_DIR)
    this.currentChat = this.createChat()
    this.currentVersionIndex = -1
  }

  getCurrentChat(): Chat {
    return this.currentChat
  }

  addMessage(chat: Chat, message: Message) {
    // Before adding new message, clean up any screenshots in previous messages
    // Skip the last message as it may not have been processed by the backend yet
    const lastIndex = chat.messages.length - 1
    chat.messages = chat.messages.map((msg, index) => {
      if (index === lastIndex) {
        return msg // Preserve the most recent message in its entirety
      }
      // Handle both base64 data in content string and screenshot in JSON
      if (msg.content) {
        if (
          typeof msg.content === 'string' &&
          msg.content.includes('"screenshot"')
        ) {
          return {
            ...msg,
            content: msg.content.replace(
              /"screenshot"\s*:\s*"[^"]+"/g,
              '"screenshot":"[SCREENSHOT_PLACEHOLDER]"'
            ),
          }
        }
      }
      return msg
    })

    // Add the new message
    chat.messages.push(message)
    chat.updatedAt = new Date().toISOString()
    this.saveChat(chat)

    // Save messages to .codebuff/messages/messages.json
    this.saveMessagesToFile(chat)
  }

  private saveMessagesToFile(chat: Chat) {
    try {
      const messagesDir = path.join(this.baseDir, 'messages')
      ensureDirectoryExists(messagesDir)

      const messagesPath = path.join(messagesDir, 'messages.json')
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
    const chat: Chat = {
      id: this.generateChatId(),
      messages,
      fileVersions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.saveChat(chat)
    return chat
  }

  private saveChat(chat: Chat): void {
    const filePath = this.getFilePath(chat.id)
    // fs.writeFileSync(filePath, JSON.stringify(chat, null, 2))
  }

  private generateChatId(): string {
    const now = new Date()
    const datePart = now.toISOString().split('T')[0] // YYYY-MM-DD
    const timePart = now
      .toISOString()
      .split('T')[1]
      .replace(/:/g, '-')
      .split('.')[0] // HH-MM-SS
    const randomPart = Math.random().toString(36).substr(2, 5)
    return `${datePart}_${timePart}_${randomPart}`
  }

  private getFilePath(chatId: string): string {
    return path.join(this.baseDir, `${chatId}.json`)
  }
}
