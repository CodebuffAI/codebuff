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
import { hasSignificantDeepChanges } from 'common/util/object'

const openai = getOpenAI('strange-loop')

function extractTagContent(xml: string, tag: string): string {
  const startTag = `<${tag}>`
  const endTag = `</${tag}>`
  const start = xml.indexOf(startTag)
  if (start === -1) return ''

  const contentStart = start + startTag.length
  const end = xml.indexOf(endTag, contentStart)
  if (end === -1) return ''

  const content = xml.substring(contentStart, end).trim()
  return content
}

function extractSubgoals(
  xml: string
): Array<{ description: string; status: string }> {
  const subgoals: Array<{ description: string; status: string }> = []
  let currentIndex = 0

  while (true) {
    const subgoalStart = xml.indexOf('<subgoal>', currentIndex)
    if (subgoalStart === -1) break

    const subgoalEnd = xml.indexOf('</subgoal>', subgoalStart)
    if (subgoalEnd === -1) break

    const subgoalContent = xml.substring(subgoalStart, subgoalEnd + 9)
    const description = extractTagContent(subgoalContent, 'description')
    const status = extractTagContent(subgoalContent, 'status')

    if (description && status) {
      subgoals.push({ description, status })
    }

    currentIndex = subgoalEnd + 9
  }

  return subgoals
}

function formatStepsTaken(
  subgoals: Array<{ description: string; status: string }>
): string {
  if (subgoals.length === 0) return ''

  return (
    '\n' + subgoals.map((sg) => `- ${sg.description} (${sg.status})`).join('\n')
  )
}

function createBackgroundSection(
  goal: string,
  subgoals: Array<{ description: string; status: string }>
): string {
  return `<background>
Previous goal was completed:
${goal}

Steps taken:${formatStepsTaken(subgoals)}
</background>`
}

interface StrangeLoopResult {
  context: string
  completed: boolean
  files: Array<{ path: string; content: string }>
}

export async function runStrangeLoop(
  initialInstruction: string,
  relativeProjectPath: string = process.cwd(),
  previousContext?: string,
  previousFiles: Array<{ path: string; content: string }> = []
): Promise<StrangeLoopResult> {
  console.log('Strange Loop initialized!')
  const projectPath = path.resolve(process.cwd(), relativeProjectPath)
  const currentDir = process.cwd()
  const initialFiles = await readFiles(['system-instructions.md'], currentDir)
  const systemPrompt = initialFiles['system-instructions.md']
  if (!systemPrompt) {
    throw new Error('No system-instructions.md found')
  }

  const files: { path: string; content: string }[] = [...previousFiles]
  let toolResults: { tool: string; result: string }[] = []

  let context: string
  if (previousContext) {
    const goal = extractTagContent(previousContext, 'goal')
    const subgoals = extractSubgoals(previousContext)
    context = createBackgroundSection(goal, subgoals)

    context += `
<goal>
${initialInstruction}
</goal>`
  } else {
    context = `<goal>\n${initialInstruction}\n</goal>`
  }

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
    const previousContextJson = xmlToJson(context)
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
${toolResults.length > 0 ? `I just ran some tools. Review the results in the <tool_results> section and update your context with any relevant information.` : ''}
Proceed toward the goal and subgoals.
You must use the updateContext tool call to record your progress and any new information you learned at the end of your response.
Optionally use other tools to make progress towards the goal. Try to use multiple tools in one response to make quick progress.
Use the "complete" tool only when you are confident the goal has been achieved. It can only be used after you've called the "review" tool at least once.
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
    if (toolCalls.length === 0) {
      console.error('No tool calls found in response, trying again')
      continue
    }
    toolResults = []

    for (const toolCall of toolCalls) {
      const params = toolCall.parameters

      switch (toolCall.name) {
        case 'update_context': {
          console.log(`Updating context: ${params.prompt}`)
          context = await updateContext(context, params.prompt)
          break
        }
        case 'write_file': {
          const filePath = params.path
          // Ensure file is being written to test-outputs directory
          if (!filePath.startsWith('test-outputs/')) {
            console.error(
              `❌ Cannot write to ${filePath} - must write to test-outputs/ directory`
            )
            toolResults.push({
              tool: 'write_file',
              result: `Error: Must write files to ${projectPath} directory`,
            })
            continue
          }
          console.log(`Writing file: ${filePath}`)
          await writeFile(filePath, params.content, projectPath)
          files.push({ path: filePath, content: params.content })
          toolResults.push({
            tool: 'write_file',
            result: `Wrote file: ${filePath}`,
          })
          break
        }
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
            result: `Read ${Object.values(fileContents).filter(Boolean).length} files`,
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
            result: `<command>${params.command}</command><stdout>${stdout}</stdout><stderr>${stderr}</stderr><exit_code>${exitCode}</exit_code>`,
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
          return { context, completed: true, files }
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
        case 'review':
          console.log('Running review...')
          let needsChanges = false
          let reviewMsg = ''

          // Run type checker
          if (params.path) {
            const { success, msg } = await checkTaskFile(
              params.path,
              projectPath
            )
            if (!success) {
              needsChanges = true
              reviewMsg += `Type check failed:\n${msg}\n\n`
            } else {
              reviewMsg += `Type check passed.\n\n`
            }
          }

          if (needsChanges) {
            toolResults.push({
              tool: 'review',
              result: `Changes needed:\n${reviewMsg}`,
            })
            break
          }
          return { context, completed: true, files }
        default:
          console.error(`Unknown tool: ${toolCall.name}`)
      }
    }

    const currentContextJson = xmlToJson(context)

    const changes = diffContexts(previousContextJson, currentContextJson)

    await appendToLog({
      msg: `Iteration ${iteration}: ${toolCalls.map((toolCall) => toolCall.name).join(', ')}`,
      level: 'info',
      iteration,
      timestamp: new Date().toISOString(),
      changes,
      previousContext: previousContextJson,
      context: currentContextJson,
      contextLength: context.length,
      messages,
      toolCalls,
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

function diffContexts(
  prev: any,
  curr: any
): Record<string, { before: any; after: any }> {
  const changes: Record<string, { before: any; after: any }> = {}

  // Helper to check if values are significantly different
  const isDifferent = (a: any, b: any): boolean => {
    if (typeof a !== typeof b) return true
    if (typeof a === 'object' && a !== null && b !== null) {
      return hasSignificantDeepChanges(a, b, 0.001)
    }
    return a !== b
  }

  // Recursively compare objects
  const compareObjects = (prev: any, curr: any, path: string = '') => {
    if (typeof prev !== 'object' || typeof curr !== 'object') {
      if (isDifferent(prev, curr)) {
        changes[path] = { before: prev, after: curr }
      }
      return
    }

    const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)])
    for (const key of allKeys) {
      const currentPath = path ? `${path}.${key}` : key
      if (!(key in prev)) {
        changes[currentPath] = { before: null, after: curr[key] }
      } else if (!(key in curr)) {
        changes[currentPath] = { before: prev[key], after: null }
      } else if (isDifferent(prev[key], curr[key])) {
        compareObjects(prev[key], curr[key], currentPath)
      }
    }
  }

  compareObjects(prev, curr)
  return changes
}
