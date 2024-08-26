import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { model_types } from 'shared/helpers/claude'
import * as ts from 'typescript'

import { runScript } from 'run-script'
import { promptClaudeStream, promptClaude } from 'shared/helpers/claude'
import { filterDefined } from 'common/util/array'

runScript(async () => {
  const userPrompt = process.argv[2]
  // E.g.:
  // I want to create a new page which shows off what's happening on manifold right now. Can you use our websocket api to get recent bets on markets and illustrate what's happening in a compelling and useful way?
  if (!userPrompt) {
    console.log('Please provide a prompt on what code to change.')
    return
  }

  await manicode(userPrompt)
})

const manicode = async (firstPrompt: string) => {
  // First prompt to Claude: Ask which files to read
  const fileSelectionPrompt = `
    The user has a coding assignment for you.

    Can you answer the below prompt with:
    1. A description of what the user wants done.
    2. Your best summary of what strategy you will employ to implement it in code (keep it simple!).
    3. A list of which files (up to 20) would be most relevant to read or write to for providing an accurate response. Please list only the file paths, one per line. You will later respond in a second prompt with edits to make to these files (or what new files to create), so choose the files wisely.

    User's request: ${firstPrompt}
    `

  const system = getSystemPrompt()

  // Save the system prompt to a file
  // const systemPromptFilePath = path.join(__dirname, 'system-prompt.md')
  // fs.writeFileSync(systemPromptFilePath, system, 'utf8')

  const fileSelectionResponse = await promptClaudeAndApplyFileChanges(
    fileSelectionPrompt,
    {
      system,
    }
  )
  const fileContents = loadListedFiles(fileSelectionResponse)

  // Second prompt to Claude: Answer the user's question
  const secondPrompt = `
<user_request>
${firstPrompt}
</user_request>

<instructions>
The user has a coding question for you. Please provide a detailed response following this structure:

1. User Request: Briefly restate what the user wants to accomplish.

2. Implementation Strategy: Outline your approach to implement the requested changes.

3. File Modifications: List all files that need to be modified or created, and they will be changed according to your instruction.
For each file, provide one file block with the file path as an xml attribute and the updated file contents:
<file path="path/to/new/file.tsx">
// Entire file contents here
</file>

To modify an existing file, use comments to indicate where existing code should be preserved:
<file path="path/to/existing/file.tsx">
// ... existing imports...

// ... existing code ...

function getDesktopNav() {
  console.log('Hello from the desktop nav')

  // ... rest of the function
}

// ... rest of the file
</file>
</instructions>

<important_reminders>
- Always include imports: either reproduce the full list of imports, or add new imports with comments like " ... existing imports" and "// ... rest of imports". If the imports are not changed then include a comment: "// ... existing imports"
- Use may comments like "// ... existing code ..." or " ... rest of the file" to indicate where existing code should be preserved, however it is good to provide a few other lines of context around the changes.
- Ensure that you're providing enough context around the changes for accurate matching.
</important_reminders>

<example>
1. User Request: Add a new NewComponent and use it in the Home page.

2. Implementation Strategy:
   - Create a new file for NewComponent
   - Modify the Home page to import and use NewComponent
   - Ensure all necessary imports are added

3. File Modifications:

<file path="web/components/NewComponent.tsx">
import React from 'react'

export const NewComponent: React.FC = () => {
  return <div>This is a new component</div>
}
</file>

<file path="web/pages/Home.tsx">
// ... existing imports ...
import { AnotherComponentUsedForContext } from '../components/AnotherComponentUsedForContext'
import { NewComponent } from '../components/NewComponent'

const Home: React.FC = () => {
  // ... existing code ...
  return (
    <div>
      <h1>Welcome to the Home page</h1>
      <SomeExistingComponent />
      <NewComponent />
    </div>
  )
}

// ... rest of the file
</file>
</example>

Now, please provide your response based on the following file contents and user request:`

  const fullPrompt = `${secondPrompt}

${fileContents}

User: ${firstPrompt}
`

  const secondResponse = await promptClaudeAndApplyFileChanges(fullPrompt, {
    system,
  })

  interface ConversationEntry {
    role: 'user' | 'assistant'
    content: string
  }

  const conversationHistory: ConversationEntry[] = [
    { role: 'user', content: firstPrompt },
    { role: 'assistant', content: secondResponse },
  ]

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  await new Promise<void>((resolve) => {
    function promptUser() {
      rl.question(
        'Enter your prompt (or type "quit" or "q"):\n>',
        async (userInput: string) => {
          const exitWords = ['exit', 'quit', 'q']
          if (exitWords.includes(userInput.trim().toLowerCase())) {
            rl.close()
            resolve()
            return
          }

          conversationHistory.push({ role: 'user', content: userInput })

          // Second Claude call: Answer the user's question
          const fullPrompt = conversationHistory
            .map(({ role, content }) => {
              const label =
                role === 'user' ? 'The user said:' : 'The assistant said:'
              return `${label}\n\n${content}`
            })
            .join('\n\n')
          // First Claude call: Ask which files to read
          const fileSelectionPrompt = `
<conversation_history>
${fullPrompt}
</conversation_history>

<instructions>
Based on the conversation above, which files do you need to read to answer the user's question? Please list the file paths, one per line. It's recommended you include all files you have edited so far.
</instructions>
`
          // Get updated system prompt (includes updated list of files)
          const system = getSystemPrompt()

          const filesToReadResponse = await promptClaudeAndApplyFileChanges(
            fileSelectionPrompt,
            { system }
          )
          const fileContents = loadListedFiles(filesToReadResponse)

          const finalPrompt = `${fullPrompt}\n\nRelevant file contents:\n\n${fileContents}`

          const claudeResponse = await promptClaudeAndApplyFileChanges(
            finalPrompt,
            {
              system,
            }
          )

          conversationHistory.push({
            role: 'assistant',
            content: claudeResponse,
          })

          // Continue the loop
          promptUser()
        }
      )
    }

    promptUser()
  })

  console.log('Manicode session ended.')
}

function loadListedFiles(instructions: string) {
  const filesToRead = instructions.trim().split('\n')

  // Read the content of selected files
  return filterDefined(
    filesToRead.map((file) => {
      const filePath = path.join(__dirname, '..', '..', file)
      try {
        return `<file path="${file}">\n\n${fs.readFileSync(
          filePath,
          'utf8'
        )}\n\n</file>`
      } catch (error) {
        return undefined
      }
    })
  ).join('\n\n')
}

async function promptClaudeAndApplyFileChanges(
  prompt: string,
  options: { system?: string; model?: model_types } = {}
) {
  let fullResponse = ''
  let currentFileBlock = ''
  let isComplete = false
  const originalPrompt = prompt
  const fileProcessingPromises: Promise<void>[] = []

  while (!isComplete) {
    const stream = promptClaudeStream(prompt, options)

    for await (const chunk of stream) {
      fullResponse += chunk
      currentFileBlock += chunk
      process.stdout.write(chunk)

      const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g
      let fileMatch
      while ((fileMatch = fileRegex.exec(currentFileBlock)) !== null) {
        const [, filePath, fileContent] = fileMatch
        fileProcessingPromises.push(processFileBlock(filePath, fileContent))
      }

      currentFileBlock = currentFileBlock.replace(fileRegex, '')
    }

    if (fullResponse.includes('[END_OF_RESPONSE]')) {
      isComplete = true
      fullResponse = fullResponse.replace('[END_OF_RESPONSE]', '')
    } else {
      prompt = `Please continue your previous response. Remember to end with [END_OF_RESPONSE] when you've completed your full answer.

<original_prompt>
${originalPrompt}
</original_prompt>

Continue from the very next character of your response:
${fullResponse}`
    }
  }

  await Promise.all(fileProcessingPromises)

  return fullResponse
}

async function promptClaudeWithContinuation(
  prompt: string,
  options: { system?: string; model?: model_types } = {}
) {
  let fullResponse = ''
  let isComplete = false
  const originalPrompt = prompt

  // Add the instruction to end with [END_OF_RESPONSE] to the system prompt
  if (options.system) {
    options.system += '\n\nAlways end your response with "[END_OF_RESPONSE]".'
  } else {
    options.system = 'Always end your response with "[END_OF_RESPONSE]".'
  }

  while (!isComplete) {
    const stream = promptClaudeStream(prompt, options)

    for await (const chunk of stream) {
      fullResponse += chunk
    }

    if (fullResponse.includes('[END_OF_RESPONSE]')) {
      isComplete = true
      fullResponse = fullResponse.replace('[END_OF_RESPONSE]', '')
    } else {
      prompt = `Please continue your previous response. Remember to end with [END_OF_RESPONSE] when you've completed your full answer.

<original_prompt>
${originalPrompt}
</original_prompt>

Continue from the very next character of your response (the next char could even be '\n'):
${fullResponse}`
    }
  }

  return fullResponse
}

async function processFileBlock(filePath: string, fileContent: string) {
  const fullPath = path.join(__dirname, '..', '..', filePath)
  const currentContent = fs.existsSync(fullPath)
    ? fs.readFileSync(fullPath, 'utf8')
    : ''

  if (currentContent) {
    // File exists, generate diff
    const diffBlocks = await generateDiffBlocks(currentContent, fileContent)
    let updatedContent = currentContent

    for (const { oldContent, newContent } of diffBlocks) {
      const replaced = applyReplacement(updatedContent, oldContent, newContent)

      if (replaced) {
        updatedContent = replaced
      } else {
        console.log(
          `Couldn't find simple match for replacement in file: ${filePath}. Attempting to expand...`
        )
        const expandedReplacement = await promptClaudeForExpansion(
          filePath,
          updatedContent,
          oldContent,
          newContent
        )
        if (expandedReplacement) {
          const expandedReplaced = applyReplacement(
            updatedContent,
            expandedReplacement.oldContent,
            expandedReplacement.newContent
          )
          if (expandedReplaced) {
            updatedContent = expandedReplaced
            console.log('Successfully applied expanded replacement.')
          } else {
            console.log('Warning: Could not apply expanded replacement.')
            console.log(
              'Original old:',
              oldContent,
              'expandedReplacement:',
              expandedReplacement.oldContent
            )
          }
        }
      }
    }

    if (updatedContent !== currentContent) {
      fs.writeFileSync(fullPath, updatedContent)
      console.log(`Updated file: ${filePath}`)
    } else {
      console.log(`No changes made to file: ${filePath}`)
    }
  } else {
    // New file, create it
    const dir = path.dirname(fullPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, fileContent.trim())
    console.log(`Created new file: ${filePath}`)
  }
}

async function generateDiffBlocks(currentContent: string, newContent: string) {
  const prompt = `
I have a new version of a file, and I want to change the old file into the new file. I need to generate <old> and <new> blocks to represent the exact line-by-line differences so I can string replace the old content to the new content. If there are multiple changes, provide multiple pairs of blocks.

The new file may use shorthand such as "// ... existing code ..." or " ... rest of the file" to indicate unchanged code. However, we do not want to include these in your <old> or <new> blocks, because we want to replace the exact lines of code that are being changed.

Please structure your response in a few steps:

1. Describe what code changes are being made. What's being inserted? What's being deleted?
2. Split the changes into logical groups. Describe the sets of lines or logical chunks of code that are being changed. For example, modifying the import section, modifying a function, etc.
3. Describe what lines of context from the old file you will use for each edit, so that string replacement of the old and new blocks will work correctly. Do not use any comments like "// ... existing code ..." or " ... rest of the file" as part of this context, because these comments don't exist in the old file, so string replacement won't work to make the edit.
4. Finally, please provide a <file> block containing the <old> and <new> blocks for each chunk of line changes. Find the smallest possible blocks that match the changes.

IMPORTANT INSTRUCTIONS:
1. The <old> blocks MUST match a portion of the old file content EXACTLY, character for character. Do not include any comments or placeholders like "// ... existing code ...". Instead, provide the exact lines of code that are being changed.
2. Ensure that you're providing enough context in the <old> blocks to match exactly one location in the file.
3. The <old> blocks should have as few lines as possible. Consider matching only a few lines around the change! Do not include dozens of lines of imports for no reason.
4. The <new> blocks should contain the updated code that replaces the content in the corresponding <old> block. Do not include any comments or placeholders like "// ... existing code ...".
5. Create separate <old> and <new> blocks for each distinct change in the file.

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
<file>
<old>
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
</file>
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
<file>
<old>
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
</file>
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

Now, here is the prompt.

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

  const diffResponse = await promptClaudeWithContinuation(prompt)

  const diffBlocks = []
  const fileRegex = /<file>([\s\S]*?)<\/file>/
  const fileMatch = diffResponse.match(fileRegex)

  if (fileMatch) {
    const fileContent = fileMatch[1]
    const blockRegex = /<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>/g
    let blockMatch

    while ((blockMatch = blockRegex.exec(fileContent)) !== null) {
      diffBlocks.push({
        oldContent: blockMatch[1].trim(),
        newContent: blockMatch[2].trim(),
      })
    }
  }

  return diffBlocks
}

function applyReplacement(
  content: string,
  oldContent: string,
  newContent: string
): string | null {
  const trimmedOldContent = oldContent.trim()
  const trimmedNewContent = newContent.trim()

  // First, try an exact match
  if (content.includes(trimmedOldContent)) {
    console.log('worked with exact match')
    return content.replace(trimmedOldContent, trimmedNewContent)
  }

  // If exact match fails, try matching with flexible whitespace
  const oldLines = trimmedOldContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const contentLines = content.split('\n')

  for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
    const potentialMatch = contentLines.slice(i, i + oldLines.length)
    if (
      potentialMatch.every((line, index) =>
        line.trim().includes(oldLines[index])
      )
    ) {
      // Found a match with flexible whitespace
      const matchedContent = potentialMatch.join('\n')
      const leadingWhitespace = potentialMatch[0].match(/^\s*/)?.[0] || ''
      const indentedNewContent = trimmedNewContent
        .split('\n')
        .map((line) => leadingWhitespace + line)
        .join('\n')

      console.log('worked with flexible whitespace')
      return content.replace(matchedContent, indentedNewContent)
    }
  }

  return null
}

function getSystemPrompt() {
  const codeFiles = getOnlyCodeFiles()
  const exportedTokens = getExportedTokensForFiles(codeFiles)
  const filesWithExports = codeFiles
    .map((filePath) => {
      const tokens = exportedTokens[filePath]
      return tokens && tokens.length > 0
        ? `${filePath}: ${tokens.join(', ')}`
        : filePath
    })
    .join('\n')

  const manifoldInfoPath = path.join(__dirname, '..', '..', 'manifold-info.md')
  const manifoldInfo = fs.readFileSync(manifoldInfoPath, 'utf8')

  const codeGuidePath = path.join(__dirname, '..', '..', 'code-guide.md')
  const codeGuide = fs.readFileSync(codeGuidePath, 'utf8')

  const apiSchemaFile = fs.readFileSync(
    path.join(__dirname, '..', '..', 'common', 'src', 'api', 'schema.ts'),
    'utf8'
  )

  const apiGuide = `
<api_guide>
Here's our API schema. Each key-value pair in the below object corresponds to an endpoint.

E.g. 'comment' can be accessed at \`api.manifold.markets/v0/comment\`. If 'visibility' is 'public', then you need the '/v0', otherwise, you should omit the version. However, you probably don't need the url, you can use our library function \`api('comment', props)\`, or \`useAPIGetter('comment', props)\`
${apiSchemaFile}
</api_guide>
`

  return `
<manifold_info>
${manifoldInfo}
</manifold_info>

<code_guide>
${codeGuide}
</code_guide>

${apiGuide}

<project_files>
Here are all the code files in our project. If the file has exported tokens, they are listed in the same line in a comma-separated list.
${filesWithExports}
</project_files>

<editing_instructions>
To edit any files, please use the following schema.
For each file, provide one file block with the file path as an xml attribute and the updated file contents:
<file path="path/to/new/file.tsx">
// Entire file contents here
</file>

To modify an existing file, use comments to indicate where existing code should be preserved:
<file path="path/to/existing/file.tsx">
// ... existing imports...

// ... existing code ...

function getDesktopNav() {
  console.log('Hello from the desktop nav')

  // ... rest of the function
}

// ... rest of the file
</file>
</editing_instructions>

<important_instruction>
Always end your response with the following marker:
[END_OF_RESPONSE]
If your response is cut off due to length limitations, do not include the marker and wait for a follow-up prompt to continue.
</important_instruction>`
}

// Function to load file names of every file in the project
function loadAllProjectFiles(projectRoot: string): string[] {
  const allFiles: string[] = []

  function getAllFiles(dir: string) {
    try {
      const files = fs.readdirSync(dir)
      files.forEach((file) => {
        const filePath = path.join(dir, file)
        try {
          const stats = fs.statSync(filePath)
          if (stats.isDirectory()) {
            getAllFiles(filePath)
          } else {
            allFiles.push(filePath)
          }
        } catch (error: any) {
          // do nothing
        }
      })
    } catch (error: any) {
      // do nothing
    }
  }

  getAllFiles(projectRoot)
  return allFiles
}

function getOnlyCodeFiles() {
  const projectRoot = path.join(__dirname, '..', '..')
  const codeDirs = ['common', 'backend', 'web']
  const excludedDirs = [
    'node_modules',
    'dist',
    'scripts',
    'twitch-bot',
    'discord-bot',
  ]
  const includedFiles = ['manicode.ts', 'backfill-unique-bettors-day.ts']
  const allProjectFiles = loadAllProjectFiles(projectRoot)
    .filter((file) => codeDirs.some((dir) => file.includes(dir)))
    .filter(
      (file) =>
        !excludedDirs.some((dir) => file.includes('/' + dir + '/')) ||
        includedFiles.some((name) => file.endsWith(name))
    )
    .filter(
      (file) =>
        file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.sql')
    )
    .filter((file) => !file.endsWith('.d.ts'))
    .map((file) => file.replace(projectRoot + '/', ''))
  return allProjectFiles
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

  const expandedResponse = await promptClaude(prompt, {
    system: getSystemPrompt(),
  })

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

function getExportedTokensForFiles(
  filePaths: string[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  const fullFilePaths = filePaths.map((filePath) =>
    path.join(__dirname, '..', '..', filePath)
  )
  const program = ts.createProgram(fullFilePaths, {})

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i]
    const fullFilePath = fullFilePaths[i]
    const sourceFile = program.getSourceFile(fullFilePath)
    if (sourceFile) {
      try {
        const exportedTokens = getExportedTokens(sourceFile)
        result[filePath] = exportedTokens
      } catch (error) {
        console.error(`Error processing file ${fullFilePath}:`, error)
        result[filePath] = []
      }
    } else {
      // console.error(`Could not find source file: ${fullFilePath}`)
      result[filePath] = []
    }
  }

  return result
}

function getExportedTokens(sourceFile: ts.SourceFile): string[] {
  const exportedTokens: string[] = []

  function visit(node: ts.Node) {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((element) => {
          exportedTokens.push(element.name.text)
        })
      }
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isVariableStatement(node)
    ) {
      if (
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
        )
      ) {
        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
          if (node.name) {
            exportedTokens.push(node.name.text)
          }
        } else if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach((declaration) => {
            if (ts.isIdentifier(declaration.name)) {
              exportedTokens.push(declaration.name.text)
            }
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return exportedTokens
}
