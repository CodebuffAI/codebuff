import { WebSocket } from 'ws'
import { FileChange, Message } from 'common/actions'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { processFileBlock } from './main-prompt'
import { promptClaude } from './claude'
import { getProjectFileTreePrompt, getRelevantFilesPrompt, knowledgeFilesPrompt } from './system-prompt'
import { DEFAULT_TOOLS } from 'common/util/tools'
import { debugLog } from './util/debug'
import { env } from './env.mjs'

export async function generateKnowledgeFiles(
  userId: string,
  ws: WebSocket,
  fullResponse: string,
  fileContext: ProjectFileContext,
  initialMessages: Message[]
): Promise<Promise<FileChange | null>[]> {
  // debugLog('generateKnowledgeFiles', {
  //   fileContext,
  //   initialMessages,
  // })
  if (env.ENVIRONMENT === 'production') {
    console.log('generateKnowledgeFiles', {
      fileContext,
      initialMessages,
    })
  }
  const systemPrompt = `
    You are an assistant that helps developers create knowledge files for their codebase. You are helpful and concise, knowing exactly when enough information has been gathered to create a knowledge file. Here's some more information on knowledge files:
    ${knowledgeFilesPrompt}

    In this conversation, the assistant and user are making changes to a codebase. You should use this chat history to create a knowledge file if their changes are meaningful. If their changes are not meaningful, you should not create/update a knowledge file.
    IMPORTANT: a meaningful change is one that is not easily self-evident in the code. An example of a meaningful change is if the user wants to use a package manager aside from the default, because that is hard to find in the codebase. A good rule of thumb is if a quick, hurried glance through the code is enough to understand the change, it is not meaningful to add to our knowledge files. If the change is too complex or requires a lot of context to understand, it's meaningful and thus a good idea to add it to the knowledge file.
    Here are some examples of meaningful changes:
    - user added a new package to the project -> this means developers likely want to use this package to extend the project's functionality in a particular way and other developers/LLMs may want to use it as well. A knowledge file would be a great way for everyone to be on the same page about the new package and how it fits into the project.
    - user has corrected your previous response because you made a mistake -> this means the user had something else in mind. A knowledge file would be a great way for everyone to learn from your mistake and improve your responses in the future.
    
    Here are some examples of meaningless changes:
    - user has asked you to keep adding new features to the project -> this means the user is likely not interested in the project's current functionality and is looking for something else.
    - code is sufficient to explain the change -> this means developers can easily figure out the context of the change without needing a knowledge file.
    <important>
    Reminder: a meaningful change is one that is not self-evident in the code. 
    If the change isn't important enough to warrant a new knowledge file, please do not output anything. We don't want to waste the user's time on irrelevant changes.
    This is also meant to be helpful for future LLMs like yourself. Thus, please be concise and avoid unnecessary details. If the change is important, please provide a detailed description of what we're doing and why.
    
    Do not include any code or other files in the knowledge file. Don't use any tools. Make the most minimal changes necessary to the files to ensure the information is captured.
    </important>


    Here's the project file tree:
    ${getProjectFileTreePrompt(fileContext)}

    Here are some relevant files and code diffs that you should consider: 
    ${getRelevantFilesPrompt(fileContext)}
    
    `
  const userPrompt = `    
    Think before you write the knowledge file in <thinking> tags. Use that space to think about why the change is important and what it means for the project, and verify that we don't already have something similar in the existing knowledge files. Make sure to show your work!

    First, please summarize the penultimate and last set of messages between the user and the assistant. Use the following format:
    [user]: [message summary]
    [assistant]: [message summary]
    [change made]: [note about the change]

    [user]: [message summary]
    [assistant]: [message summary]
    [change made]: [note about the change]
    
    First, explain the last change asked in your own words.

    Next, carefully answer the following questions. The more you answer "yes" to these questions, the more likely it is that we should create a knowledge file.

    Questions:
    1. Was the user correcting the assistant's previous response based on missing context the assistant should know?
    2. If another senior developer read the code, would they think the change is not obvious after reading the code? Assume they have strong foundational knowledge. If the code is clear enough on its own, then the answer to this question is "no".
    
    Consider how strong of a "yes" you gave to each of these questions. Only with at least one very strong "yes" should you output anything.
    
    Should we create or update a knowledge file?  If not, please skip the rest of the response and don't output anything. This is the most common case; there should be a high bar to creating or updating a knowledge file.

    Otherwise, check the existing knowledge files to see if there isn't something written about it yet. If there is, don't output anything because we don't want to repeat ourselves.
    Finally, for any meaningful change that hasn't been captured in the knowledge file, you should update a knowledge file with <file> blocks. Prefer editing existing knowledge files instead of creating new ones. Make sure the file path ends in '.knowledge.md'.
    `

  const messages = [
    ...initialMessages,
    {
      role: 'assistant' as const,
      content:
        "Got it, I'll determine if I need to create/update the knowledge file and generate if necessary. Can you share any relevant information about the project?",
    },
    {
      role: 'user' as const,
      content: userPrompt,
    },
  ]

  const response = await promptClaude(messages, {
    userId,
    system: systemPrompt,
    tools: DEFAULT_TOOLS,
  })

  const files = parseFileBlocks(response)

  console.log('knowledge files to upsert:', Object.keys(files))
  debugLog('deciding on upserting knowledge files', response)

  const fileChangePromises = Object.entries(files).map(
    ([filePath, fileContent]) =>
      processFileBlock(
        userId,
        ws,
        messages,
        fullResponse,
        filePath,
        fileContent
      )
  )
  return fileChangePromises
}
