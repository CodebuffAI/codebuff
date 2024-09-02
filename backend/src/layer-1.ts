import { WebSocket } from 'ws'

import { Message } from 'common/actions'
import { getSystemPrompt } from './system-prompt'
import { ProjectFileContext } from 'common/util/file'
import { requestRelevantFiles } from './request-files-prompt'
import { assert } from 'common/util/object'

export const layer1 = async (
  ws: WebSocket,
  userId: string,
  messages: Message[],
  fileContext: ProjectFileContext
) => {
  const lastMessage = messages[messages.length - 1]
  assert(lastMessage.role === 'user', 'Last message must be from user')

  const system = getSystemPrompt(fileContext, {
    checkFiles: false,
  })

  const files = await requestRelevantFiles(
    ws,
    { messages, system },
    fileContext,
    null,
    userId
  )

  const filePaths = Object.keys(files)
  const responseChunk = getRelevantFileInfoMessage(filePaths)

  return { responseChunk, files }
}

function getRelevantFileInfoMessage(filePaths: string[]) {
  if (filePaths.length === 0) {
    return ''
  }
  return `Reading the following files...<files>${filePaths.join(', ')}</files>\n\n`
}

const skipToLayer3 = (ws: WebSocket, userId: string, messages: Message[], fileContext: ProjectFileContext) => {
  const lastMessage = messages[messages.length - 1]
  assert(lastMessage.role === 'user', 'Last message must be from user')

  const system = getSystemPrompt(fileContext, {
    checkFiles: false,
  })
  
}