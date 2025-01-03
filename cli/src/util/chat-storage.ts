import * as fs from 'fs'
import * as path from 'path'
import { FileVersion } from '../../../common/src/util/file'
import { Message } from '../../../common/src/actions'

export interface Chat {
  id: string
  messages: Message[]
  fileVersions: { files: Record<string, string> }[]
  filesChanged: string[]
}

export class ChatStorage {
  private currentChat: Chat
  private storageDir: string

  constructor(storageDir: string) {
    this.storageDir = storageDir
    fs.mkdirSync(storageDir, { recursive: true })
    this.currentChat = this.createNewChat()
  }

  private createNewChat(): Chat {
    return {
      id: Date.now().toString(),
      messages: [],
      fileVersions: [],
      filesChanged: [],
    }
  }

  getCurrentChat(): Chat {
    return this.currentChat
  }

  addMessage(chat: Chat, message: Message) {
    chat.messages.push(message)
    this.saveChat(chat)
  }

  saveFilesChanged(filesChanged: string[]) {
    this.currentChat.filesChanged.push(...filesChanged)
    this.saveChat(this.currentChat)
  }

  private saveChat(chat: Chat) {
    const chatPath = path.join(this.storageDir, `${chat.id}.json`)
    fs.writeFileSync(chatPath, JSON.stringify(chat, null, 2))
  }
}
