import { WebSocket } from 'ws'
import { FileChange, Message } from 'common/actions'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { processFileBlock } from './main-prompt'
import { promptClaude } from './claude'
import { getRelevantFilesPrompt, knowledgeFilesPrompt } from './system-prompt'
import { DEFAULT_TOOLS } from './tools'

export async function generateKnowledgeFiles(
  userId: string,
  ws: WebSocket,
  fullResponse: string,
  fileContext: ProjectFileContext,
  initialMessages: Message[]
): Promise<Promise<FileChange>[]> {
  // Prompt Claude to check for some heuristics around whether or not we've done enough meaningful work to warrant creating a knowledge file.
  // TODO: take into account the actual diffs the user manually made to the files – these likely represent little issues that we didn't do correctly
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

    Here are some relevant files and code diffs that you should consider: 
    ${getRelevantFilesPrompt(fileContext)}
    
    <important>
    Reminder: a meaningful change is one that is not easily self-evident in the code. 
    If the change isn't important enough to warrant a new knowledge file, please do not output anything. We don't want to waste the user's time on irrelevant changes.
    This is also meant to be helpful for future LLMs like yourself. Thus, please be concise and avoid unnecessary details. If the change is important, please provide a detailed description of what we're doing and why.
    
    Do not include any code or other files in the knowledge file. Don't use any tools. Make the most minimal changes necessary to the files to ensure the information is captured.
    </important>
    `
  const userPrompt = `    
    Think before you write the knowledge file in <thinking> tags. Use that space to think about why the change is important and what it means for the project, and verify that we don't already have something similar in the existing knowledge files. Make sure to show your work!

    First, please summarize the conversation. For each pair of messages between the user and the assistant, summarize them in the following format:
    [user]: [message summary]
    [assistant]: [message summary]
    [change made]: [note about the change]

    [user]: [message summary]
    [assistant]: [message summary]
    [change made]: [note about the change]
    
    Then, use the summary to see if there's anything _new_ that is meaningful (defined in system prompt above). Write out what you think is new and why it is significant.
    
    Then, check the existing knowledge files to see if there isn't something written about it yet. If there is, don't output anything because we don't want to repeat ourselves.
    Finally, for any meaningful change that hasn't been captured in the knowledge file, you should output a knowledge file with <file> blocks.
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

  console.log('knowledge files to upsert:', Object.keys(files), response)
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
