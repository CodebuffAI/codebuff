import { createFileBlock, parseFileBlocks } from 'common/util/file'
import { Message } from 'common/actions'
import { debugLog } from './util/debug'
import { STOP_MARKER } from 'common/constants'
import { promptOpenAIWithContinuation } from './openai-api'
import { openaiModels } from 'common/constants'

export async function generateExpandedFileWithDiffBlocks(
  userId: string,
  messageHistory: Message[],
  fullResponse: string,
  filePath: string,
  oldContent: string,
  newContent: string
) {
  const diffBlocks = await generateDiffBlocks(
    userId,
    messageHistory,
    fullResponse,
    filePath,
    oldContent,
    newContent
  )

  let updatedContent = oldContent

  const changes: { filePath: string; old: string; new: string }[] = []
  for (const { searchContent, replaceContent } of diffBlocks) {
    if (updatedContent.includes(searchContent)) {
      updatedContent = updatedContent.replace(searchContent, replaceContent)
      changes.push({ filePath, old: searchContent, new: replaceContent })

      debugLog('Replacement worked with exact match')
      console.log('Applied a change to', filePath)
      debugLog(`Applied a change to ${filePath}:`, {
        old: searchContent,
        new: replaceContent,
      })
    } else {
      debugLog('Failed to find a match for replacement in', filePath)
      debugLog('Old content:', oldContent)
      debugLog('New content:', newContent)
    }
  }

  if (changes.length === 0) {
    debugLog(`No changes applied to file: ${filePath}`)
  } else {
    debugLog(`Updated file: ${filePath}`)
  }
  return updatedContent
}

export async function generateDiffBlocks(
  userId: string,
  messageHistory: Message[],
  fullResponse: string,
  filePath: string,
  oldContent: string,
  newContent: string
) {
  const logMessage = `Generating diff blocks for ${filePath}`
  console.log(logMessage)
  debugLog(logMessage)
  debugLog('Old content:', oldContent)
  debugLog('New content:', newContent)

  const prompt = `
The following is a conversation with a user leading up to your task:
  
<message_history>${messageHistory.map((msg) => `<${msg.role}>${msg.content}</${msg.role}>`).join('\n')}</message_history>

<assistant_message_partial_response>${fullResponse}</assistant_message_partial_response>
  
Your task: I have a new version of a file with placeholder comments like "// ... existing code ..." or "# ... existing code ...", and I want to change the old file into the expanded new file without the placeholder comments.

Consider the intent of the user: if only one function or code block is shown, don't delete everything else that was not shown.
  
I need to generate <search> and <replace> blocks to represent the exact line-by-line differences so I can string replace the old content to the new content.

Example of how to represent a single change with <search> and <replace> blocks:
${createFileBlock(
  filePath,
  `<search>
import { Button } from './Button'
</search>
<replace>
import { FancyButton } from './FancyButton'
</replace>`
)}

If there are multiple changes, provide multiple pairs of search and replace blocks within the file block.

The provided new file may use shorthand such as "// ... existing code ..." to indicate unchanged code. However, we do not want to include these in your <search> or <replace> blocks, because we want to replace the exact lines of code that are being changed.

Please structure your response in a few steps:

1. Describe what code changes are being made. What's being inserted? What's being deleted?
2. Split the changes into logical groups. List the sets of lines or logical chunks of code that are being changed and assign each a letter. For example:
A. modifying the import section
B. modifying a function
3. For each edit (denoted by a letter), describe what lines of context from the old file you will use, so that string replacement of the search and replace blocks will work correctly. Do not use any comments like "// ... existing code ..." as part of this context, because these comments don't exist in the old file, so string replacement won't work to make the edit.
Then write out one line of code from the old file that would start each of these lines of context in the <search> block.
4. Analyze the indentation used in the old file. Is it using spaces or tabs? How many spaces are used for each indentation level?
For each edit assigned a letter, please list how many indentation levels are used in the first line being modified in the old file. It's important to match be able to match the indention in the old file. For example:
A. 0 levels of indentation for the function in the old file
B. 1 level of indentation for the variable in the old file
5. Finally, please provide a ${'<' + 'edit_file>'} block containing the <search> and <replace> blocks for each chunk of line changes. Find the smallest possible blocks that match the changes uniquely.

IMPORTANT INSTRUCTIONS:
1. The <search> blocks MUST match a portion of the old file content EXACTLY, character for character, including indentation and empty lines. Do not include any comments or placeholders like "// ... existing code ..." in the <search> blocks. Instead, provide the exact lines of code that are being changed.
2. Ensure that you're providing enough context in the <search> blocks to match exactly one location in the file.
3. The <search> blocks should have as few lines as possible while still providing enough context for a single match. Try to match only a few lines around the change.
4. The <replace> blocks should contain the updated code that replaces the content in the corresponding <search> block, maintaining the same indentation style and level as the original file. <replace> blocks should also not include comments like "// ... existing code ...".
5. Create separate <search> and <replace> blocks for each distinct change in the file.
6. Pay close attention to the indentation of both the <search> and <replace> blocks. They should match the indentation style and level of the original file exactly.
7. If the new content contains comments about edits that should be made, you should remove those. E.g. Remove comments like "// Add these new functions at the top of the file"

<example_prompt>
Old file content:
${createFileBlock(
  'components/login-form.tsx',
  `import React from 'react'
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

export default LoginForm`
)}

New file content (with placeholders):
${createFileBlock(
  'components/login-form.tsx',
  `// ... existing code ...
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
}`
)}
</example_prompt>

<example_response>
1. The user is adding a new import and changing the form to use react-hook-form.

2. The changes can be split into two logical groups:
A. Adding a new import
B. Modifying the LoginForm component

3. Context for each edit:
A. We'll use the line importing Input as context for the new import:
\`import { Input } from './Input'\`

B. We'll replace the entire LoginForm function (first line below):
\`function LoginForm() {\`

4. It's using 2 spaces for indentation.
A. 0 levels of indentation for the import in old file
B. 0 levels of indentation for the LoginForm function in old file

5. Here are the <search> and <replace> blocks:

${createFileBlock(
  filePath,
  `A. <search>
import { Input } from './Input'
</search>
<replace>
import { Input } from './Input'
import { useForm } from 'react-hook-form'
</replace>

B. <search>
export function LoginForm() {
  return (
    <form>
      <Input type="email" placeholder="Email" />
      <Input type="password" placeholder="Password" />
      <Button>Log In</Button>
    </form>
  )
}
</search>
<replace>
export function LoginForm() {
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
</replace>`
)}
</example_response>

<example_prompt>
Old file content:
${createFileBlock(
  'components/desktop-nav.tsx',
  `import React from 'react'
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
}`
)}

New file content (with placeholders):
${createFileBlock(
  'components/desktop-nav.tsx',
  `// ... existing code ...
import { SearchIcon } from '@heroicons/react/solid'
import {
  GlobeAltIcon,
  UserIcon,
  LightningBoltIcon,
  UserAddIcon,
  NotificationsIcon,
} from '@heroicons/react/outline'

// ... existing code ...

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

      // ... existing code ...
    )

  // ... existing code ...
}

// ... existing code ...`
)}
</example_prompt>

<example_response>
1. The code changes involve updating the import for the notification icon and changing the icon used in the getDesktopNav function.

2. The changes can be split into two logical groups:
A. Modifying the import statement
B. Updating the icon in the getDesktopNav function

3. Context for each edit:
A. We'll use the entire import statement for @heroicons/react/outline as context:
\`import {
  GlobeAltIcon,
  UserIcon,
  LightningBoltIcon,
  UserAddIcon,
  BellIcon,
} from '@heroicons/react/outline'\`

B. We'll use the Notifications item in the buildArray function as context:
\`{
  name: 'Notifications',
  href: '/notifications',
  icon: BellIcon,
}\`

4. The file is using 2 spaces for indentation.
A. 0 levels of indentation for the import statement in old file
B. 3 levels of indentation (6 spaces) for the Notifications item in old file

5. Here are the <search> and <replace> blocks:

${createFileBlock(
  filePath,
  `A. <search>
import {
  GlobeAltIcon,
  UserIcon,
  LightningBoltIcon,
  UserAddIcon,
  BellIcon,
} from '@heroicons/react/outline'
</search>
<replace>
import {
  GlobeAltIcon,
  UserIcon,
  LightningBoltIcon,
  UserAddIcon,
  NotificationsIcon,
} from '@heroicons/react/outline'
</replace>

B. <search>
      {
        name: 'Notifications',
        href: '/notifications',
        icon: BellIcon,
      },
</search>
<replace>
      {
        name: 'Notifications',
        href: '/notifications',
        icon: NotificationsIcon,
      },
</replace>`
)}
</example_response>

<important_instruction>
Notice that your responses should not include any comments like "// ... existing code ...". It should only include the actual code that should be string replaced.

That is because we are using a very simple string replacement system to update the old code to the new code:

\`\`\`
function applyReplacement(
  content: string,
  searchContent: string,
  replaceContent: string
): string | null {
  const trimmedSearchContent = searchContent.trim()
  const trimmedReplaceContent = replaceContent.trim()

  if (content.includes(trimmedSearchContent)) {
    // Search content must match a substring of content exactly.
    return content.replace(trimmedSearchContent, trimmedReplaceContent)
  }

  return null
}
\`\`\`
</important_instruction>

Now, here is the prompt.

Old file content:
${createFileBlock(filePath, oldContent)}

New file content (with placeholders):
${createFileBlock(filePath, newContent)}

Your Response:`

  // fs.writeFileSync('./diff-prompt.txt', prompt)

  // const { response } = await promptClaudeWithContinuation(
  //   [{ role: 'user', content: prompt }],
  //   { userId }
  // )
  const response = await promptOpenAIWithContinuation(
    [{ role: 'user', content: prompt }],
    { model: openaiModels.gpt4o, fingerprintId: userId }
  )

  debugLog('OpenAI response for diff blocks:', response)

  const { diffBlocks, diffBlocksThatDidntMatch } = parseAndGetDiffBlocks(
    response,
    filePath,
    oldContent
  )
  for (const change of diffBlocksThatDidntMatch) {
    console.log('diff block didnt match', filePath)
    debugLog('Warning: diff block didnt match', filePath)
  }
  if (diffBlocks.length === 0 && diffBlocksThatDidntMatch.length === 0) {
    console.log('No diff blocks generated', filePath)
    debugLog('Warning: No diff blocks generated', filePath)
  } else if (diffBlocksThatDidntMatch.length > 0) {
    const newPrompt =
      `The assistant failed to find a match for the following changes in the file ${filePath}. Please help the assistant understand what the changes should be.

Here is the previous prompt that the assistant was given:
<prompt>
${prompt}
</prompt>

The assistant generated the following <search> and <replace> blocks where the <search> content did not match the old file contents:

${diffBlocksThatDidntMatch.map((change) => `<search>${change.searchContent}</search>\n<replace>${change.replaceContent}</replace>`).join('\n\n')}

It also generated these <search> and <replace> blocks which were able to be applied to the old file content:

${diffBlocks.map((change) => `<search>${change.searchContent}</search>\n<replace>${change.replaceContent}</replace>`).join('\n\n')}

You should:
1. Use <thinking> blocks to explain what might have gone wrong in the result of the last prompt.
2. Within a <strategy> block, provide a new strategy to cover all the changes from the old file to the new file. List each intended edit that will become a <search> and <replace> block. Note that comments such as "// ... existing code ..." or "// ... rest of the file" should not be included in the <search> or <replace> blocks.
3. Provide the complete set of <search> and <replace> changes within a <edit_file path="${filePath}"></edit_file> block to make the intended edit from the old file to the new file.

Please make sure to end your response with the following string:
${STOP_MARKER}
`.trim()
    console.log('Trying a second prompt for getDiffBlocks', filePath)
    debugLog('Trying a second prompt for getDiffBlocks', filePath)
    const response = await promptOpenAIWithContinuation(
      [{ role: 'user', content: newPrompt }],
      { fingerprintId: userId, model: openaiModels.gpt4o }
    )
    debugLog('Second Claude response for diff blocks:', response)

    const {
      diffBlocks: newDiffBlocks,
      diffBlocksThatDidntMatch: newDiffBlocksThatDidntMatch,
    } = parseAndGetDiffBlocks(response, filePath, oldContent)
    for (const change of newDiffBlocksThatDidntMatch) {
      console.log('Still found new diff block didnt match', filePath)
      debugLog('Warning: Still found new diff block didnt match', filePath)
    }
    return newDiffBlocks
  }

  return diffBlocks
}

const parseAndGetDiffBlocks = (
  response: string,
  filePath: string,
  oldFileContent: string
) => {
  const diffBlocksThatDidntMatch: {
    searchContent: string
    replaceContent: string
  }[] = []
  const diffBlocks: { searchContent: string; replaceContent: string }[] = []
  const files = parseFileBlocks(response)
  for (const fileContent of Object.values(files)) {
    const blockRegex =
      /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/g
    let blockMatch

    while ((blockMatch = blockRegex.exec(fileContent)) !== null) {
      const change = {
        searchContent: removeNewlinesFromStartAndEnd(blockMatch[1]),
        replaceContent: removeNewlinesFromStartAndEnd(blockMatch[2]),
      }

      if (oldFileContent.includes(change.searchContent)) {
        diffBlocks.push(change)
      } else {
        const newChange = tryToDoStringReplacementWithExtraIndentation(
          oldFileContent,
          change.searchContent,
          change.replaceContent
        )
        if (newChange) {
          console.log('Matched with indentation modification')
          debugLog('Matched with indentation modification')
          diffBlocks.push(newChange)
        } else {
          diffBlocksThatDidntMatch.push(change)
        }
      }
    }
  }
  return {
    diffBlocks,
    diffBlocksThatDidntMatch,
  }
}

const tryToDoStringReplacementWithExtraIndentation = (
  oldFileContent: string,
  searchContent: string,
  replaceContent: string
) => {
  for (let i = 1; i <= 12; i++) {
    const searchContentWithIndentation = searchContent
      .split('\n')
      .map((line) => (line ? ' '.repeat(i) + line : line))
      .join('\n')
    if (oldFileContent.includes(searchContentWithIndentation)) {
      return {
        searchContent: searchContentWithIndentation,
        replaceContent: replaceContent
          .split('\n')
          .map((line) => (line ? ' '.repeat(i) + line : line))
          .join('\n'),
      }
    }
  }
  for (let i = 1; i <= 6; i++) {
    const searchContentWithIndentation = searchContent
      .split('\n')
      .map((line) => (line ? '\t'.repeat(i) + line : line))
      .join('\n')
    if (oldFileContent.includes(searchContentWithIndentation)) {
      return {
        searchContent: searchContentWithIndentation,
        replaceContent: replaceContent
          .split('\n')
          .map((line) => (line ? '\t'.repeat(i) + line : line))
          .join('\n'),
      }
    }
  }
  return null
}

const removeNewlinesFromStartAndEnd = (content: string): string => {
  return content.replace(/^\n+|\n+$/g, '')
}
