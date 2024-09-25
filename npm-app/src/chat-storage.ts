import * as fs from 'fs'
import * as path from 'path'
import { Message } from 'common/actions'
import { getExistingFiles, getProjectRoot } from './project-files'

const MANICODE_DIR = '.manicode'
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
    this.baseDir = path.join(getProjectRoot(), MANICODE_DIR, CHATS_DIR)
    // this.ensureDirectoryExists()
    this.currentChat = this.createChat()
    this.currentVersionIndex = -1
  }

  private getFilePath(chatId: string): string {
    return path.join(this.baseDir, `${chatId}.json`)
  }

  createChat(messages: Message[] = []): Chat {
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

  getChat(chatId: string): Chat | null {
    const filePath = this.getFilePath(chatId)
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(fileContent) as Chat
    }
    return null
  }

  addMessage(chat: Chat, message: Message) {
    chat.messages.push(message)
    chat.updatedAt = new Date().toISOString()
    this.saveChat(chat)
  }

  deleteChat(chatId: string): boolean {
    const filePath = this.getFilePath(chatId)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
    return false
  }

  listChats(): Chat[] {
    const chatFiles = fs
      .readdirSync(this.baseDir)
      .filter((file) => file.endsWith('.json'))
    return chatFiles.map((file) => {
      const filePath = path.join(this.baseDir, file)
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(fileContent) as Chat
    })
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

  getCurrentChat(): Chat {
    return this.currentChat
  }

  setCurrentChat(chatId: string) {
    const chat = this.getChat(chatId)
    if (chat) {
      this.currentChat = chat
      this.currentVersionIndex = chat.fileVersions.length - 1
    } else {
      throw new Error(`Chat with id ${chatId} not found`)
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
}
