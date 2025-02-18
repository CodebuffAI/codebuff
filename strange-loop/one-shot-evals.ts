import { runStrangeLoop } from './index.js'
import fs from 'fs'

const getInstruction = (i: number) => {
  return `
  This is task ${i + 1}. To complete this task, you must:
  - Create a new file "task-${i + 1}.ts" in the project directory that contains the entry point of the program to complete the task.
  - The file should be executable with "bun task-${i + 1}.ts" and do what is described in the task.
  `.trim()
}
const prompts = [
  'Specify a complete node console game in a single file. Your goal is to make a game that is fun and interesting. You should put a lot of work into making it polished.',
  'Design a command-line tool that helps developers manage their git workflow more efficiently. Consider common git operations and how to simplify them.',
  'Create a markdown parser that converts markdown to HTML, focusing on the most commonly used markdown features. Make it simple but robust.',
  'Build a simple HTTP server that serves static files and implements basic caching. Focus on performance and proper HTTP header handling.',
].map((prompt, i) => `${getInstruction(i)}\n\n${prompt}`)

async function checkTaskFile(taskNumber: number) {
  const filename = `task-${taskNumber}.ts`
  try {
    await fs.promises.access(filename)
    console.log(`✅ Task ${taskNumber}: File ${filename} was created successfully`)
    
    // Try to run the file to check if it's valid TypeScript
    try {
      await fs.promises.readFile(filename, 'utf-8')
      console.log(`✅ Task ${taskNumber}: File ${filename} is valid TypeScript`)
    } catch (error) {
      console.error(`❌ Task ${taskNumber}: File ${filename} has invalid TypeScript:`, error)
    }
  } catch {
    console.error(`❌ Task ${taskNumber}: File ${filename} was not created`)
  }
}

async function runAllPrompts() {
  console.log('Starting all prompts in parallel...')

  const results = await Promise.all(
    prompts.map((prompt, i) => {
      console.log(`Starting prompt ${i + 1}...`)
      return runStrangeLoop(prompt)
        .then(async () => {
          await checkTaskFile(i + 1)
          return true
        })
        .catch((error) => {
          console.error(`Error in prompt ${i + 1}:`, error)
          return false
        })
    })
  )

  console.log('\nSummary:')
  results.forEach((success, i) => {
    console.log(`Task ${i + 1}: ${success ? 'Completed' : 'Failed'}`)
  })

  console.log('\nAll prompts completed')
  return results
}

// Only run if this is the main module
if (import.meta.url === import.meta.resolve('./one-shot-evals.ts')) {
  runAllPrompts().catch(console.error)
}
