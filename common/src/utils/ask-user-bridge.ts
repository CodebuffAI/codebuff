import type { AskUserQuestion } from '../tools/params/tool/ask-user'

export type AskUserRequest = {
  toolCallId: string
  questions: AskUserQuestion[]
  resolve: (response: any) => void
}

type Listener = (request: AskUserRequest | null) => void

let pendingRequest: AskUserRequest | null = null
const listeners: Listener[] = []

export const AskUserBridge = {
  request: (toolCallId: string, questions: AskUserQuestion[]) => {
    return new Promise((resolve) => {
      pendingRequest = { toolCallId, questions, resolve }
      notifyListeners()
    })
  },

  submit: (response: any) => {
    if (pendingRequest) {
      pendingRequest.resolve(response)
      pendingRequest = null
      notifyListeners()
    }
  },

  getPendingRequest: () => pendingRequest,

  subscribe: (listener: Listener) => {
    listeners.push(listener)
    listener(pendingRequest)
    return () => {
      const idx = listeners.indexOf(listener)
      if (idx !== -1) listeners.splice(idx, 1)
    }
  },
}

function notifyListeners() {
  listeners.forEach((l) => l(pendingRequest))
}
