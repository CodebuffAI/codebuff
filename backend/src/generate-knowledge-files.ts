import { WebSocket } from 'ws'
import { FileChange, Message } from 'common/actions'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { processFileBlock } from './process-file-block'
import { promptClaude } from './claude'
import {
  getSearchSystemPrompt,
  knowledgeFilesPrompt,
  editingFilesPrompt,
} from './system-prompt'
import { logger } from './util/logger'

export async function generateKnowledgeFiles(
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  ws: WebSocket,
  fullResponse: string,
  fileContext: ProjectFileContext,
  initialMessages: Message[],
  userId?: string
): Promise<Promise<FileChange | null>[]> {
  const searchSystemPrompt = getSearchSystemPrompt(fileContext)
  const systemPrompt = [
    ...searchSystemPrompt,
    {
      type: 'text' as const,
      text: `You are an assistant that helps developers create knowledge files for their codebase. You are helpful and concise, knowing exactly when enough information has been gathered to create a knowledge file. Here's some more information on knowledge files:
    ${knowledgeFilesPrompt}

    ${editingFilesPrompt}

    In this conversation, the assistant and user are making changes to a codebase. You should use this chat history to create or update a knowledge file if their changes are meaningful. If their changes are not meaningful, you should not create/update a knowledge file.
    IMPORTANT: a meaningful change is one that is not easily self-evident in the code.
    Here are some examples of meaningful changes:
    - user has corrected your previous response because you made a mistake -> this means the user had something else in mind. A knowledge file would be a great way for everyone to learn from your mistake and improve your responses in the future.
    
    Here are some examples of changes that are not meaningful:
    - user has asked you to keep adding new features to the project -> this means the user is likely not interested in the project's current functionality and is looking for something else.
    - code is sufficient to explain the change -> this means developers can easily figure out the context of the change without needing a knowledge file.
    <important>
    Reminder: a meaningful change is one that is not self-evident in the code. 
    If the change isn't important enough to warrant a new knowledge file, please do not output anything. We don't want to waste the user's time on irrelevant changes.
    This is also meant to be helpful for future LLMs like yourself. Thus, please be concise and avoid unnecessary details. If the change is important, please provide a detailed description of what we're doing and why.
    
    Do not include any code or other files in the knowledge file. Make the most minimal changes necessary to the files to ensure the information is captured.
    </important>
    `.trim(),
    },
  ]

  const userPrompt = `    
    Do not act on the user's last request, but keep it in mind. Instead, your task will be to decide whether to create or update a knowledge file.

    Carefully consider the following questions, but do not write anything. The more you think the answer is "yes" to these questions, the more likely it is that we should create a knowledge file.

    Questions:
    1. In the last user message, was the user correcting the assistant's last response based on missing context the assistant should know?
    2. In the last user message, was the user expecting an outcome from the assistant's response that was not delivered? If so, is there a bit of instruction that would help you better meet their expectations in the future?
    
    Consider how strong of a "yes" you gave to each of these questions. Only with at least one very strong "yes" should you output anything.
    
    Next, consider:
    3. Is there a lesson here that is not specific to just this change? Is there knowledge that is not derivable from the code written? Is there some context that would be applicable for the future that the user would want recorded?
    4. Is there a significant piece of new information that is not already in the codebase or a knowledge file? It has to not be derivable from the codebase at all.

    If not all of these questions are a strong yes, don't output anything other than "No knowledge file changes needed". This is the most common case by far; there should be a really high bar to creating or updating a knowledge file.

    Otherwise, you should update a knowledge file with <edit_file> blocks to capture the new information. Prefer editing existing knowledge files instead of creating new ones. Make sure the file path ends in '.knowledge.md'.

    When you are updating an existing knowledge file, please do not remove previous knowledge file content. Instead, either reproduce the entire file with your additions or use SEARCH/REPLACE edits to insert new lines into the existing file.
    Do not update any files other than knowledge files (files that end in 'knowledge.md').
    `.trim()

  const messages = [
    ...initialMessages,
    {
      role: 'assistant' as const,
      content:
        "Got it, I'll determine if I need to create or update any knowledge files. Can you share any relevant information about the project?",
    },
    {
      role: 'user' as const,
      content: userPrompt,
    },
  ]

  const response = await promptClaude(messages, {
    clientSessionId,
    fingerprintId,
    userInputId,
    system: systemPrompt,
    userId,
  })

  const fileChanges = parseFileBlocks(response)
  const knowledgeFileChanges = Object.fromEntries(
    Object.entries(fileChanges).filter(([filePath]) =>
      filePath.endsWith('knowledge.md')
    )
  )

  logger.debug(
    {
      fileContext,
      initialMessages,
      files: Object.keys(fileChanges),
      knowledgeFiles: Object.keys(knowledgeFileChanges),
      response,
    },
    'generateKnowledgeFiles: context and response'
  )

  const fileChangePromises = Object.entries(knowledgeFileChanges).map(
    async ([filePath, changes]) => {
      const fileChange = await processFileBlock(
        clientSessionId,
        fingerprintId,
        userInputId,
        ws,
        messages,
        fullResponse,
        filePath,
        changes,
        userId
      ).catch((error) => {
        logger.error(
          { error },
          'Error processing file block for knowledge file'
        )
        return null
      })
      if (fileChange) {
        return { ...fileChange, changes }
      }
      return null
    }
  )
  return fileChangePromises
}
