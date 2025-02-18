console.log('Strange Loop initialized!')

import { getOpenAI } from 'backend/openai-api'
import { models } from 'common/constants'
import {
  tools,
  updateContext,
  writeFile,
  checkTaskFile,
  appendToLog,
  readFiles,
} from './tools'
import { createMarkdownFileBlock } from 'common/util/file'

const openai = getOpenAI('strange-loop')

export async function runStrangeLoop(initialInstruction: string) {
  const initialFiles = await readFiles(['system-prompt.md'])
  const systemPrompt = initialFiles['system-prompt.md']
  if (!systemPrompt) {
    throw new Error('No system-prompt.md found')
  }

  let context = `<goal>${initialInstruction}</goal>`
  const files: { path: string; content: string }[] = []

  const buildSystemPrompt = () => {
    const filesSection = `
<files>
${files.map((file) => createMarkdownFileBlock(file.path, file.content)).join('\n')}
</files>
`.trim()
    return [systemPrompt, filesSection, context].join('\n\n')
  }

  let iteration = 0

  while (true) {
    iteration++
    console.log(`Iteration ${iteration}`)
    const previousContext = context
    const messages = [
      {
        role: 'system' as const,
        content: buildSystemPrompt(),
      },
      {
        role: 'user' as const,
        content: `
Proceed toward the goal and subgoals.
You must use the updateContext tool call to record your progress at the end of your response.
Optionally use other tools to make progress towards the goal.
Use the complete tool only when you are confident the goal has been acheived.
`.trim(),
      },
    ]
    const response = await openai.chat.completions.create({
      messages,
      model: models.o3mini,
      tools,
      tool_choice: 'auto',
    })
    const toolCalls = response.choices[0].message.tool_calls

    if (toolCalls) {
      for (const toolCall of toolCalls) {
        const params = JSON.parse(toolCall.function.arguments)

        switch (toolCall.function.name) {
          case 'updateContext':
            console.log(`Updating context: ${params.prompt}`)
            context = await updateContext(context, params.prompt)
            break
          case 'writeFile':
            console.log(`Writing file: ${params.path}`)
            await writeFile(params.path, params.content)
            files.push({ path: params.path, content: params.content })
            break
          case 'checkFile':
            console.log(`Checking file: ${params.path}`)
            const success = await checkTaskFile(params.path)
            if (!success) {
              console.error(`❌ File ${params.path} validation failed`)
            }
            break
          case 'complete':
            console.log(`Task completed: ${params.summary}`)
            await appendToLog({
              msg: `Task completed`,
              level: 'info',
              iteration,
              timestamp: new Date().toISOString(),
              summary: params.summary,
            })
            return
          default:
            console.error(`Unknown tool: ${toolCall.function.name}`)
        }
      }
    }
    await appendToLog({
      msg: `Iteration ${iteration}`,
      level: 'info',
      iteration,
      timestamp: new Date().toISOString(),
      previousContext,
      context,
      contextLength: context.length,
      toolCalls: response.choices[0].message.tool_calls,
    })
  }
}
