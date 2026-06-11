import { CHAT_DISABLED, CHAT_DISABLED_MESSAGE } from '@/server/chat/disabled'

import { ChatApp } from './_components/chat-app'

export default function ChatPage() {
  if (CHAT_DISABLED) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Chat is taking a break</h1>
          <p className="mt-3 text-muted-foreground">{CHAT_DISABLED_MESSAGE}</p>
        </div>
      </div>
    )
  }
  return <ChatApp />
}
