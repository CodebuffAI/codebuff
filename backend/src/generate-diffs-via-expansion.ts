import { createPatch } from 'diff'

import { promptClaude } from './claude'
import { models } from './claude'
import { debugLog } from './debug'
import { Message } from 'common/actions'
import { createFileBlock } from 'common/util/file'

export async function generatePatch(
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[]
) {
  const expandedContent = await expandNewContent(
    oldContent,
    newContent,
    filePath,
    messageHistory
  )
  return createPatch(filePath, oldContent, expandedContent)
}

export async function expandNewContent(
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[]
): Promise<string> {
  const prompt = `You are an expert programmer tasked with expanding a shortened version of a file into its full content. The shortened version uses comments like "// ... existing code ..." or "// ... rest of the function ..." or "// keep existing code ..." to indicate unchanged sections. Your task is to replace these comments with the actual code from the old version of the file.

Your response should follow the following format:
1. Please discuss the changes in the new file content compared to the old file content in <discussion> blocks.

2. Please provide the full expanded content of the new file, replacing all "// ... existing code ..." comments with the appropriate code from the old file.
This requires you to compose the resulting file with exact lines from the old file and new file only. You are just copying whole lines character for character. Maintain the exact indentation and formatting of both the old and new content. Do not add any extra comments or explanations.

Pay particular attention to the last lines of the old file, which might have important closing brackets to copy over.

Output the full content of the new file within a <file> block, using the provided file path as an attribute.

Here are two examples to illustrate the task:

Example 1 (Simple change):

<example>
Old file content:
${createFileBlock(
  'example1.ts',
  `import React from 'react'

const Button = () => {
  return <button>Click me</button>
}
`
)}

New file content (with placeholders):
${createFileBlock(
  'example1.ts',
  `import React from 'react'

const FunButton = () => {
  return <button>Fun Button</button>
}
`
)}

Expected response:
<discussion>
The changes in this file include:
1. Renaming the component from 'Button' to 'FunButton'
2. Changing the button text from 'Click me' to 'Fun Button'
</discussion>

${createFileBlock(
  'example1.ts',
  `import React from 'react'

const FunButton = () => {
  return <button>Fun Button</button>
}
`
)}
</example>

Example 2 (Partial change with existing code):

<example>
Old file content:
${createFileBlock(
  'example2.ts',
  `import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { ProjectFileContext } from 'common/util/file'
import {
  applyChanges,
  getProjectFileContext,
  getFileBlocks,
  getFiles,
} from './project-files'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { Message } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
import { ChatStorage } from './chat-storage'

const displayMenu = () => {
  console.clear()
  console.log('Chat History:')
  const chats = chatStorage.listChats()
  const totalItems = chats.length + 1 // +1 for the "New Chat" option
  const startIndex = menuOffset
  const endIndex = Math.min(startIndex + CHATS_PER_PAGE, totalItems)

  for (let i = startIndex; i < endIndex; i++) {
    if (i < chats.length) {
      const chat = chats[i]
      const isSelected = i === menuSelectedIndex
      const marker = isSelected ? '>' : ' '
      console.log(\`\${marker} \${chat.id} (\${new Date(chat.updatedAt).toLocaleString()})\`)
    } else {
      const isSelected = i === menuSelectedIndex
      const marker = isSelected ? '>' : ' '
      console.log(\`\${marker} \${NEW_CHAT_OPTION}\`)
    }
  }

  if (totalItems > CHATS_PER_PAGE) {
    console.log(\`\nShowing \${startIndex + 1}-\${endIndex} of \${totalItems} items\`)
  }

  console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
}
`
)}

New file content (with placeholders):
${createFileBlock(
  'example2.ts',
  `// ... existing code ...

const displayMenu = () => {
  console.clear()
  console.log('Chat History:')
  const chats = chatStorage.listChats()
  const totalChats = chats.length

  if (totalChats === 0) {
    console.log('No chats available.')
    console.log(\`\n\${NEW_CHAT_OPTION}\`)
    return
  }

  const visibleRange = 5 // Total number of chats to display (2 on each side + 1 selected)
  const halfRange = Math.floor(visibleRange / 2)

  let startIndex = Math.max(0, menuSelectedIndex - halfRange)
  let endIndex = Math.min(totalChats - 1, startIndex + visibleRange - 1)

  // Adjust startIndex if we're near the end of the list
  if (endIndex - startIndex < visibleRange - 1) {
    startIndex = Math.max(0, endIndex - visibleRange + 1)
  }

  if (startIndex > 0) {
    console.log('...')
  }

  for (let i = startIndex; i <= endIndex; i++) {
    const chat = chats[i]
    const isSelected = i === menuSelectedIndex
    const marker = isSelected ? '>' : ' '
    console.log(\`\${marker} \${chat.id} (\${new Date(chat.updatedAt).toLocaleString()})\`)
  }

  if (endIndex < totalChats - 1) {
    console.log('...')
  }

  console.log(\`\n\${NEW_CHAT_OPTION}\`)
  console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
}

// ... existing code ...
`
)}

Expected response:
<discussion>
The changes in this file include:
1. Updating the displayMenu function to handle empty chat lists and improve the display of chat history
2. Implementing a new scrolling mechanism for the chat list
3. Removing the CHATS_PER_PAGE and totalItems variables
4. Adding checks for empty chat lists and displaying appropriate messages
</discussion>

${createFileBlock(
  'example2.ts',
  `import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { ProjectFileContext } from 'common/util/file'
import {
  applyChanges,
  getProjectFileContext,
  getFileBlocks,
  getFiles,
} from './project-files'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { Message } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
import { ChatStorage } from './chat-storage'

const displayMenu = () => {
  console.clear()
  console.log('Chat History:')
  const chats = chatStorage.listChats()
  const totalChats = chats.length

  if (totalChats === 0) {
    console.log('No chats available.')
    console.log(\`\n\${NEW_CHAT_OPTION}\`)
    return
  }

  const visibleRange = 5 // Total number of chats to display (2 on each side + 1 selected)
  const halfRange = Math.floor(visibleRange / 2)

  let startIndex = Math.max(0, menuSelectedIndex - halfRange)
  let endIndex = Math.min(totalChats - 1, startIndex + visibleRange - 1)

  // Adjust startIndex if we're near the end of the list
  if (endIndex - startIndex < visibleRange - 1) {
    startIndex = Math.max(0, endIndex - visibleRange + 1)
  }

  if (startIndex > 0) {
    console.log('...')
  }

  for (let i = startIndex; i <= endIndex; i++) {
    const chat = chats[i]
    const isSelected = i === menuSelectedIndex
    const marker = isSelected ? '>' : ' '
    console.log(\`\${marker} \${chat.id} (\${new Date(chat.updatedAt).toLocaleString()})\`)
  }

  if (endIndex < totalChats - 1) {
    console.log('...')
  }

  console.log(\`\n\${NEW_CHAT_OPTION}\`)
  console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
}
`
)}
</example>

Now, please provide your response for the following old and new file contents, following the format shown in the examples above.

Old file content:
${createFileBlock(filePath, oldContent)}

New file content (with placeholders):
${createFileBlock(filePath, newContent)}`
  const expandedContentResponse = await promptClaude(prompt, {
    model: models.haiku,
  })

  debugLog(
    'Expanded content response for filePath',
    filePath,
    expandedContentResponse
  )

  // Extract the content from the <file> block
  const fileContentMatch = expandedContentResponse.match(
    /<file[^>]*>([\s\S]*)<\/file>/
  )
  if (fileContentMatch) {
    return fileContentMatch[1].trim() + '\n'
  } else {
    throw new Error('Failed to extract file content from Claude Haiku response')
  }
}
