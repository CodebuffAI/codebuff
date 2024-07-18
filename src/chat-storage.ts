import * as fs from 'fs'
import * as path from 'path'
import { Message } from 'common/actions'

const MANICODE_DIR = '.manicode'
const CHATS_DIR = 'chats'

interface Chat {
  id: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export class ChatStorage {
  private baseDir: string

  constructor(projectRoot: string) {
    this.baseDir = path.join(projectRoot, MANICODE_DIR, CHATS_DIR)
    this.ensureDirectoryExists()
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }

  private getFilePath(chatId: string): string {
    return path.join(this.baseDir, `${chatId}.json`)
  }

  createChat(messages: Message[] = []): Chat {
    const chat: Chat = {
      id: this.generateChatId(),
      messages,
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
    fs.writeFileSync(filePath, JSON.stringify(chat, null, 2))
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
}
