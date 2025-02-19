console.log('Strange Loop initialized!')

import { getOpenAI } from 'backend/openai-api'
import { models } from 'common/constants'
import {
  updateContext,
  writeFile,
  checkTaskFile,
  appendToLog,
  readFiles,
  parseToolCalls,
  toolsInstructionPrompt,
  executeCommand,
} from './tools'
import { createMarkdownFileBlock } from 'common/util/file'

const openai = getOpenAI('strange-loop')

export async function runStrangeLoop(initialInstruction: string) {
  const initialFiles = await readFiles(['system-instructions.md'])
  const systemPrompt = initialFiles['system-instructions.md']
  if (!systemPrompt) {
    throw new Error('No system-instructions.md found')
  }

  let context = `<goal>\n${initialInstruction}\n</goal>`
  const files: { path: string; content: string }[] = []
  let toolResults: { tool: string; result: string }[] = []

  const buildSystemPrompt = () => {
    const filesSection = `
<files>
${files.map((file) => createMarkdownFileBlock(file.path, file.content)).join('\n')}
</files>
`.trim()

    const toolResultSection =
      toolResults.length > 0
        ? `
<tool_results>
${toolResults
  .map(
    (result) => `<tool_result>
<tool>${result.tool}</tool>
<result>${result.result}</result>
</tool_result>`
  )
  .join('\n')}
</tool_results>
`.trim()
        : ''

    return [
      systemPrompt,
      toolsInstructionPrompt,
      filesSection,
      toolResultSection,
    ]
      .filter(Boolean)
      .join('\n\n')
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
        role: 'assistant' as const,
        content: context,
      },
      {
        role: 'user' as const,
        content: `
${toolResults.length > 0 ? `Tools were just executed. Review the results in the <tool_results> section and update your context with any relevant information.` : ''}
Proceed toward the goal and subgoals.
You must use the updateContext tool call to record your progress and any new information you learned at the end of your response.
Optionally use other tools to make progress towards the goal.
Use the complete tool only when you are confident the goal has been acheived.

`.trim(),
      },
    ]
    const response = await openai.chat.completions.create({
      messages,
      model: models.o3mini,
    })

    const content = response.choices[0].message.content
    if (!content) {
      console.error('No content in response')
      continue
    }

    const toolCalls = parseToolCalls(content)
    toolResults = []

    for (const toolCall of toolCalls) {
      const params = toolCall.parameters

      switch (toolCall.name) {
        case 'update_context':
          console.log(`Updating context: ${params.prompt}`)
          context = await updateContext(context, params.prompt)
          break
        case 'write_file':
          console.log(`Writing file: ${params.path}`)
          await writeFile(params.path, params.content)
          files.push({ path: params.path, content: params.content })
          break
        case 'check_file':
          console.log(`Checking file: ${params.path}`)
          const { success, error } = await checkTaskFile(params.path)
          if (!success) {
            console.error(`❌ File ${params.path} validation failed: ${error}`)
          }
          toolResults.push({
            tool: 'check_file',
            result: `Success: ${success}, Error: ${error}`,
          })
          break
        case 'execute_command':
          console.log(`Executing command: ${params.command}`)
          const { stdout, stderr, exitCode } = await executeCommand(params.command)

          // Store the command result for the next iteration
          toolResults.push({
            tool: 'execute_command',
            result: `Stdout:\n${stdout}\nStderr:\n${stderr}\nExit Code: ${exitCode}`,
          })
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
          console.error(`Unknown tool: ${toolCall.name}`)
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
      toolResults,
    })
  }
}
