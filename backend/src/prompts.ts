import { Tool } from '@anthropic-ai/sdk/resources'
import { WebSocket } from 'ws'

import { promptClaudeStream, promptClaude, model_types } from './claude'
import {
  ProjectFileContext,
  createFileBlock,
  parseFileBlocks,
  fileRegex,
} from '@manicode/common/src/util/file'
import { getSystemPrompt } from './system-prompt'
import { STOP_MARKER } from '@manicode/common/src/prompts'
import { getTools } from './tools'
import { Message } from 'common/src/actions'
import { ToolCall } from 'common/src/actions'
import { debugLog } from './debug'
import { requestFile } from './websockets/websocket-action'

export async function promptClaudeAndGetFileChanges(
  ws: WebSocket,
  messages: Message[],
  fileContext: ProjectFileContext,
  onResponseChunk: (chunk: string) => void
) {
  debugLog(
    'Starting promptClaudeAndGetFileChanges',
    'messages:',
    messages.length
  )
  let fullResponse = ''
  let toolCall: ToolCall | null = null
  let continuedMessage: Message | null = null
  let currentFileBlock = ''
  let isComplete = false
  const fileProcessingPromises: Promise<
    { filePath: string; old: string; new: string }[]
  >[] = []

  const system = getSystemPrompt(fileContext)
  const tools = getTools()

  const lastMessage = messages[messages.length - 1]
  if (typeof lastMessage.content === 'string') {
    lastMessage.content = `${lastMessage.content}

<additional_instruction>Please request as many files as would help answer the user's question using the read_files tool</additional_instruction>
<additional_instruction>If the user gave feedback and it helped you understand something better, please add a short note to a knowledge file that condenses what you learned.</additional_instruction>`
  }

  while (!isComplete) {
    const messagesWithContinuedMessage = continuedMessage
      ? [...messages, continuedMessage]
      : messages
    const stream = promptClaudeStream(messagesWithContinuedMessage, {
      system,
      tools,
    })

    for await (const chunk of stream) {
      if (typeof chunk === 'object') {
        toolCall = chunk
        isComplete = true
        debugLog('Received tool call:', toolCall)
        break
      }

      fullResponse += chunk
      currentFileBlock += chunk
      onResponseChunk(chunk)

      const fileBlocks = parseFileBlocks(currentFileBlock)
      for (const [filePath, newFileContent] of Object.entries(fileBlocks)) {
        fileProcessingPromises.push(
          processFileBlock(ws, messages, filePath, newFileContent)
        )

        currentFileBlock = currentFileBlock.replace(fileRegex, '')
      }

      if (fullResponse.includes(STOP_MARKER)) {
        isComplete = true
        fullResponse = fullResponse.replace(STOP_MARKER, '')
        debugLog('Reached STOP_MARKER')
      } else {
        continuedMessage = {
          role: 'assistant',
          content: fullResponse,
        }
      }
    }
  }

  const changes = (await Promise.all(fileProcessingPromises)).flat()
  debugLog('Final changes:', changes)

  return {
    response: fullResponse,
    changes,
    toolCall,
  }
}

async function promptClaudeWithContinuation(
  messages: Message[],
  options: { system?: string; tools?: Tool[]; model?: model_types } = {}
) {
  let fullResponse = ''
  let toolCall: ToolCall | null = null
  let continuedMessage: Message | null = null
  let isComplete = false

  // Add the instruction to end with the stop market to the system prompt
  if (options.system) {
    options.system += `\n\nAlways end your response with "${STOP_MARKER}".`
  } else {
    options.system = `Always end your response with "${STOP_MARKER}".`
  }

  while (!isComplete) {
    const messagesWithContinuedMessage = continuedMessage
      ? [...messages, continuedMessage]
      : messages
    debugLog(
      'prompt claude with continuation',
      messagesWithContinuedMessage.length
    )
    const stream = promptClaudeStream(messagesWithContinuedMessage, options)

    for await (const chunk of stream) {
      if (typeof chunk === 'object') {
        console.log('Did a tool call and it probably shouldnt have', chunk)
        toolCall = chunk
        isComplete = true
        break
      }
      fullResponse += chunk
    }

    if (fullResponse.includes(STOP_MARKER)) {
      isComplete = true
      fullResponse = fullResponse.replace(STOP_MARKER, '')
    } else {
      continuedMessage = {
        role: 'assistant',
        content: fullResponse,
      }
    }
  }

  return { response: fullResponse, toolCall }
}

async function processFileBlock(
  ws: WebSocket,
  messageHistory: Message[],
  filePath: string,
  newContent: string
) {
  debugLog('Processing file block', filePath)

  const oldContent = await requestFile(ws, filePath)

  if (oldContent === null) {
    debugLog(`Created new file: ${filePath}`)
    return [{ filePath, old: '', new: newContent }]
  }

  // File exists, generate diff
  const diffBlocks = await generateDiffBlocks(
    messageHistory,
    filePath,
    oldContent,
    newContent
  )
  let updatedContent = oldContent

  const changes: { filePath: string; old: string; new: string }[] = []
  for (const { oldContent, newContent } of diffBlocks) {
    if (updatedContent.includes(oldContent)) {
      debugLog('Replacement worked with exact match')
      updatedContent = updatedContent.replace(oldContent, newContent)
      changes.push({ filePath, old: oldContent, new: newContent })
      console.log('Applied a change to', filePath)
      debugLog(`Applied a change to ${filePath}:`, {
        old: oldContent,
        new: newContent,
      })
    } else {
      debugLog('Failed to find a match for replacement in', filePath)
      debugLog('Old content:', oldContent)
      debugLog('New content:', newContent)
    }
  }

  if (changes.length === 0) {
    debugLog(`No changes applied to file: ${filePath}`)
    return []
  }

  debugLog(`Updated file: ${filePath}`)
  return changes
}

async function generateDiffBlocks(
  messageHistory: Message[],
  filePath: string,
  currentContent: string,
  newContent: string
) {
  const logMessage = `Generating diff blocks for ${filePath}`
  console.log(logMessage)
  debugLog(logMessage)
  debugLog('Current content:', currentContent)
  debugLog('New content:', newContent)

  const prompt = `
I have a new version of a file, and I want to change the old file into the new file. I need to generate <old> and <new> blocks to represent the exact line-by-line differences so I can string replace the old content to the new content. If there are multiple changes, provide multiple pairs of blocks.

The new file may use shorthand such as "// ... existing code ..." or " ... rest of the file" to indicate unchanged code. However, we do not want to include these in your <old> or <new> blocks, because we want to replace the exact lines of code that are being changed.

Please structure your response in a few steps:

1. Describe what code changes are being made. What's being inserted? What's being deleted?
2. Split the changes into logical groups. Describe the sets of lines or logical chunks of code that are being changed. For example, modifying the import section, modifying a function, etc.
3. Describe what lines of context from the old file you will use for each edit, so that string replacement of the old and new blocks will work correctly. Do not use any comments like "// ... existing code ..." or " ... rest of the file" as part of this context, because these comments don't exist in the old file, so string replacement won't work to make the edit.
4. Analyze the indentation used in the old file. Three questions: Is it using spaces or tabs? How many spaces are used for each indentation level? How many indentation levels are used in the code being changed?
5. Finally, please provide a ${'<' + 'file>'} block containing the <old> and <new> blocks for each chunk of line changes. Find the smallest possible blocks that match the changes.

IMPORTANT INSTRUCTIONS:
1. The <old> blocks MUST match a portion of the old file content EXACTLY, character for character, including indentation and empty lines. Do not include any comments or placeholders like "// ... existing code ...". Instead, provide the exact lines of code that are being changed.
2. Ensure that you're providing enough context in the <old> blocks to match exactly one location in the file.
3. The <old> blocks should have as few lines as possible while still providing enough context for a single match. Try to match only a few lines around the change.
4. The <new> blocks should contain the updated code that replaces the content in the corresponding <old> block, maintaining the same indentation style and level as the original file.
5. Create separate <old> and <new> blocks for each distinct change in the file.
6. Pay close attention to the indentation of both the <old> and <new> blocks. They should match the indentation style and level of the original file exactly.

<example_prompt>
Old file content:
\`\`\`
import React from 'react'
import { Button } from './Button'
import { Input } from './Input'

export function LoginForm() {
  return (
    <form>
      <Input type="email" placeholder="Email" />
      <Input type="password" placeholder="Password" />
      <Button>Log In</Button>
    </form>
  )
}

export default LoginForm
\`\`\`

New file content:
\`\`\`
// ... existing imports ...
import { useForm } from 'react-hook-form'

function LoginForm() {
  const { register, handleSubmit } = useForm()

  const onSubmit = (data) => {
    console.log(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input type="email" placeholder="Email" {...register('email')} />
      <Input type="password" placeholder="Password" {...register('password')} />
      <Button type="submit">Log In</Button>
    </form>
  )
\`\`\`
</example_prompt>

<example_response>
1. The user is adding a new import and changing the form to use react-hook-form.
2. The import section is being modified, and the LoginForm component is being modified.
3.

- The inserted import can be after the line:

\`\`\`
import { Input } from './Input'
\`\`\`

- The LoginForm change can replace the whole function.

4. Here are my changes:
${createFileBlock(
  `<old>
import { Input } from './Input'
</old>
<new>
import { Input } from './Input'
import { useForm } from 'react-hook-form'
</new>

<old>
function LoginForm() {
  return (
    <form>
      <Input type="email" placeholder="Email" />
      <Input type="password" placeholder="Password" />
      <Button>Log In</Button>
    </form>
  )
}
</old>
<new>
function LoginForm() {
  const { register, handleSubmit } = useForm()

  const onSubmit = (data) => {
    console.log(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input type="email" placeholder="Email" {...register('email')} />
      <Input type="password" placeholder="Password" {...register('password')} />
      <Button type="submit">Log In</Button>
    </form>
  )
}
</new>
`,
  filePath
)}
</example_response>

<example_prompt>
Old file content:
\`\`\`
import React from 'react'
import { SearchIcon } from '@heroicons/react/solid'
import {
  GlobeAltIcon,
  UserIcon,
  LightningBoltIcon,
  UserAddIcon,
  BellIcon,
} from '@heroicons/react/outline'
import { buildArray } from '../utils/buildArray'

const getDesktopNav = (
  loggedIn: boolean,
  openDownloadApp: () => void,
  options: { isNewUser: boolean; isLiveTV?: boolean; isAdminOrMod: boolean }
) => {
  if (loggedIn)
    return buildArray(
      { name: 'Browse', href: '/home', icon: SearchIcon },
      {
        name: 'Explore',
        href: '/explore',
        icon: GlobeAltIcon,
      },
      {
        name: 'Live Activity',
        href: '/live-activity',
        icon: LightningBoltIcon,
      },
      {
        name: 'Notifications',
        href: '/notifications',
        icon: BellIcon,
      },
      {
        name: 'Profile',
        href: '/profile',
        icon: UserIcon,
      }
    )

  return buildArray(
    { name: 'Browse', href: '/home', icon: SearchIcon },
    { name: 'Sign Up', href: '/sign-up', icon: UserAddIcon }
  )
}

const getMobileNav = () => {
  return buildArray(
    { name: 'Browse', href: '/home', icon: SearchIcon },
    { name: 'Sign Up', href: '/sign-up', icon: UserAddIcon }
  )
}

\`\`\`

New file content:
\`\`\`
// ... existing imports ...
import { SearchIcon } from '@heroicons/react/solid'
import {
  GlobeAltIcon,
  UserIcon,
  LightningBoltIcon,
  UserAddIcon,
  NotificationsIcon,
} from '@heroicons/react/outline'

// ... rest of the imports

const getDesktopNav = (
  loggedIn: boolean,
  openDownloadApp: () => void,
  options: { isNewUser: boolean; isLiveTV?: boolean; isAdminOrMod: boolean }
) => {
  if (loggedIn)
    return buildArray(
      { name: 'Browse', href: '/home', icon: SearchIcon },
      {
        name: 'Explore',
        href: '/explore',
        icon: GlobeAltIcon,
      },
      {
        name: 'Live Activity',
        href: '/live-activity',
        icon: LightningBoltIcon,
      },
      {
        name: 'Notifications',
        href: '/notifications',
        icon: NotificationsIcon,
      },

      // ... rest of the items
    )

  // ... rest of the function
}

// ... rest of the file
\`\`\`
</example_prompt>

<example_response>
1. The user is changing the icon for the notification nav item.
2. There is a new import for the BellIcon, and then the icon is changed within the getDesktopNav function.
3.

- The import can be updated after the line:
\`\`\`
import { SearchIcon } from '@heroicons/react/solid'
\`\`\`

- The icon change can be made by replacing the item in the list:
\`\`\`
      {
        name: 'Notifications',
        href: '/notifications',
        icon: BellIcon,
      },
\`\`\`

4. Here are my changes:
${createFileBlock(
  `<old>
import { SearchIcon } from '@heroicons/react/solid'
import {
  GlobeAltIcon,
  UserIcon,
  LightningBoltIcon,
  UserAddIcon,
  BellIcon,
} from '@heroicons/react/outline'
</old>
<new>
import { SearchIcon } from '@heroicons/react/solid'
import {
  GlobeAltIcon,
  UserIcon,
  LightningBoltIcon,
  UserAddIcon,
  NotificationsIcon,
} from '@heroicons/react/outline'
</new>

<old>
      {
        name: 'Notifications',
        href: '/notifications',
        icon: BellIcon,
      },
</old>
<new>
      {
        name: 'Notifications',
        href: '/notifications',
        icon: NotificationsIcon,
      },
</new>
`,
  filePath
)}
</example_response>

<important_instruction>
Notice that your responses should not include any comments like "// ... existing code ...". It should only include the actual code that should be string replaced.

That is because we are using a very simple string replacement system to update the old code to the new code:

\`\`\`
function applyReplacement(
  content: string,
  oldContent: string,
  newContent: string
): string | null {
  const trimmedOldContent = oldContent.trim()
  const trimmedNewContent = newContent.trim()

  if (content.includes(trimmedOldContent)) {
    // Old content must match a substring of content exactly.
    return content.replace(trimmedOldContent, trimmedNewContent)
  }

  return null
}
\`\`\`
</important_instruction>

Here is the message history in case it is relevant to the code changes:
<message_history>
${messageHistory.map((m) => `${m.role}: ${m.content}`).join('\n\n')}
</message_history>

Now, here is the prompt.

File path: ${filePath}

Old file content:
\`\`\`
${currentContent}
\`\`\`

New file content:
\`\`\`
${newContent}
\`\`\`

Your Response:
`

  const { response } = await promptClaudeWithContinuation([
    { role: 'user', content: prompt },
  ])

  debugLog('Claude response for diff blocks:', response)

  const diffBlocks: { oldContent: string; newContent: string }[] = []
  const files = parseFileBlocks(response)
  for (const fileContent of Object.values(files)) {
    const blockRegex = /<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>/g
    let blockMatch

    while ((blockMatch = blockRegex.exec(fileContent)) !== null) {
      diffBlocks.push({
        oldContent: blockMatch[1].trim(),
        newContent: blockMatch[2].trim(),
      })
    }
  }

  if (diffBlocks.length === 0) {
    debugLog('Warning: No diff blocks generated')
  }

  return diffBlocks
}

async function promptClaudeForExpansion(
  filePath: string,
  currentContent: string,
  oldContent: string,
  newContent: string
) {
  const prompt = `
I'm trying to apply a code replacement, but the replacement content doesn't match exactly. Can you help expand the replacement to match the existing code?

File: ${filePath}

Current file content:
\`\`\`
${currentContent}
\`\`\`

Old content to find:
\`\`\`
${oldContent}
\`\`\`

New content to replace with:
\`\`\`
${newContent}
\`\`\`

Please provide an expanded version of the old content that matches the existing code, and the corresponding expanded version of the new content to replace with. Use the following format:

<old>
// Expanded old content here
</old>

<new>
// Expanded new content here
</new>

If you can't find a suitable expansion, please respond with "No expansion possible."
`

  // Consider adding a system prompt?
  const expandedResponse = await promptClaude(prompt)

  const expandedOldMatch = expandedResponse.match(/<old>([\s\S]*?)<\/old>/)
  const expandedNewMatch = expandedResponse.match(/<new>([\s\S]*?)<\/new>/)

  if (expandedOldMatch && expandedNewMatch) {
    return {
      oldContent: expandedOldMatch[1].trim(),
      newContent: expandedNewMatch[1].trim(),
    }
  }

  return null
}
