import path from 'path'
import { getOpenAI } from 'backend/openai-api'
import { models } from 'common/constants'
import {
  updateContext,
  writeFile,
  checkTaskFile,
  readFiles,
  parseToolCalls,
  toolsInstructionPrompt,
  executeCommand,
  appendToLog,
  listDirectory,
} from './tools'
import { createMarkdownFileBlock } from 'common/util/file'

const openai = getOpenAI('strange-loop')

export async function runStrangeLoop(
  initialInstruction: string,
  relativeProjectPath: string = process.cwd()
) {
  console.log('Strange Loop initialized!')
  const projectPath = path.resolve(process.cwd(), relativeProjectPath)
  const currentDir = process.cwd()
  const initialFiles = await readFiles(['system-instructions.md'], currentDir)
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
    const previousContext = `${context}`
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
Optionally use other tools to make progress towards the goal. Try to use multiple tools in one response to make quick progress.
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
          await writeFile(params.path, params.content, projectPath)
          files.push({ path: params.path, content: params.content })
          break
        case 'read_files':
          console.log(`Reading files: ${params.paths}`)
          const paths = params.paths.split('\n').filter(Boolean)
          const fileContents = await readFiles(paths, projectPath)
          for (const [path, content] of Object.entries(fileContents)) {
            if (content !== null) {
              files.push({ path, content })
            }
          }
          toolResults.push({
            tool: 'read_files',
            result: `Read ${Object.values(fileContents).filter(Boolean).length} files successfully`,
          })
          break
        case 'check_file':
          console.log(`Checking file: ${params.path}`)
          const { success, msg } = await checkTaskFile(params.path, projectPath)
          if (!success) {
            console.error(`❌ File ${params.path} validation failed: ${msg}`)
          }
          toolResults.push({
            tool: 'check_file',
            result: success ? `Success: ${msg}` : `Failed: ${msg}`,
          })
          break
        case 'execute_command':
          console.log(`Executing command: ${params.command}`)
          const { stdout, stderr, exitCode } = await executeCommand(
            params.command,
            projectPath
          )

          // Store the command result for the next iteration
          toolResults.push({
            tool: 'execute_command',
            result: `Stdout:\n${stdout}\nStderr:\n${stderr}\nExit Code: ${exitCode}`,
          })
          break
        case 'final_review':
          console.log('TODO: run final review (tests, type checker, etc.)')
          console.log(`Task completed: ${params.summary}`)
          await appendToLog({
            msg: `Task completed`,
            level: 'info',
            iteration,
            timestamp: new Date().toISOString(),
            summary: params.summary,
          })
          return
        case 'list_directory':
          console.log(`Listing directory: ${params.path}`)
          const entries = await listDirectory(params.path, projectPath)
          if (entries === null) {
            toolResults.push({
              tool: 'list_directory',
              result: `Failed to read directory ${params.path}`,
            })
          } else {
            toolResults.push({
              tool: 'list_directory',
              result: `Directory ${params.path} contents:\n${entries
                .map((entry) => `${entry.name} (${entry.type})`)
                .join('\n')}`,
            })
          }
          break
        default:
          console.error(`Unknown tool: ${toolCall.name}`)
      }
    }

    await appendToLog({
      msg: `Iteration ${iteration}: ${toolCalls.map((toolCall) => toolCall.name).join(', ')}`,
      level: 'info',
      iteration,
      timestamp: new Date().toISOString(),
      previousContext: xmlToJson(previousContext),
      context: xmlToJson(context),
      contextLength: context.length,
      toolCalls: response.choices[0].message.tool_calls,
      toolResults,
    })
  }
}

export function xmlToJson(xml: string): any {
  xml = xml.replace(/>\s+</g, '><').trim()

  if (!xml.includes('<')) {
    return xml.trim()
  }

  const result: any = {}

  let currentIndex = 0
  while (currentIndex < xml.length) {
    const tagStart = xml.indexOf('<', currentIndex)
    if (tagStart === -1) {
      const remainingText = xml.substring(currentIndex).trim()
      if (remainingText) {
        if (result._text) {
          result._text += ' ' + remainingText
        } else {
          result._text = remainingText
        }
      }
      break
    }

    const textContent = xml.substring(currentIndex, tagStart).trim()
    if (textContent) {
      if (result._text) {
        result._text += ' ' + textContent
      } else {
        result._text = textContent
      }
    }

    let tagName = xml.substring(tagStart + 1, xml.indexOf('>', tagStart))
    const isSelfClosing = tagName.endsWith('/')
    if (isSelfClosing) {
      tagName = tagName.slice(0, -1)
      result[tagName] = ''
      currentIndex = xml.indexOf('>', tagStart) + 1
      continue
    }

    if (tagName.startsWith('/')) {
      currentIndex = xml.indexOf('>', tagStart) + 1
      continue
    }

    const closingTag = `</${tagName}>`
    const contentStart = xml.indexOf('>', tagStart) + 1
    let contentEnd = xml.indexOf(closingTag, contentStart)

    if (contentEnd === -1) {
      contentEnd = xml.indexOf('<', contentStart)
      if (contentEnd === -1) contentEnd = xml.length
    }

    const content = xml.substring(contentStart, contentEnd)

    const value = content.includes('<') ? xmlToJson(content) : content.trim()

    if (tagName in result) {
      if (!Array.isArray(result[tagName])) {
        result[tagName] = [result[tagName]]
      }
      result[tagName].push(value)
    } else {
      result[tagName] = value
    }

    currentIndex = contentEnd + closingTag.length
  }

  if (Object.keys(result).length === 1 && '_text' in result) {
    return result._text
  }

  Object.keys(result).forEach((key) => {
    if (key.trim() === '') {
      delete result[key]
    }
  })

  return result
}
