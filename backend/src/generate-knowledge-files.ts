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
    You are an assistant that helps developers create knowledge files for their codebase. You are helpful and concise, knowing exactly when enough information has been gathered to create a knowledge file.
    The user has provided you with some changes to the codebase. You should use them to create a knowledge file if it's meaningful to do so. If the change is not meaningful, you should not create a knowledge file.
    
    Here are some examples of meaningful changes:
    - user added a new package to the project -> this means developers likely want to use this package to extend the project's functionality in a particular way and other developers/LLMs may want to use it as well. A knowledge file would be a great way for everyone to be on the same page about the new package and how it fits into the project.
    - user has corrected your previous response because you made a mistake -> this means the user had something else in mind. A knowledge file would be a great way for everyone to learn from your mistake and improve your responses in the future.
    - user has shown they want to continue building upon your previous response -> this means the user is likely satisfied with your previous response. A knowledge file would be a great way to remember what went well and do more of that in the future.
    `
  const userPrompt = `
    Here are some relevant files and code diffs that you should consider: 
    ${getRelevantFilesPrompt(fileContext)}
    
    If the change isn't important enough to warrant a new knowledge file, please do not output anything. We don't want to waste the user's time on irrelevant changes.
    This is also meant to be helpful for future LLMs like yourself. Thus, please be concise and avoid unnecessary details. If the change is important, please provide a detailed description of what we're doing and why.
    Again, this is  meant to be useful for both humans and LLMs. 

    If you determined that the change is important enough to warrant a knowledge file, please see the following instructions on how to create a helpful knowledge file:
    ${knowledgeFilesPrompt}

    First, please summarize the changes from the current conversation. If your changes are already noted in the knowledge file, make sure that is reflected in your summary.
    Then, provide a detailed description of what you're doing and why. 
    Finally, see if there's anything _new_ that is meaningful (defined in system prompt above). If there is, then output a knowledge file with <file> blocks.
    
    Do not include any code or other files in the knowledge file. Don't use any tools.
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
