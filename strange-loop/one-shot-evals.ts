import { runStrangeLoop } from './index.js'
import fs from 'fs'
import { spawn } from 'child_process'
import path from 'path'

const TEST_OUTPUT_DIR = 'test-outputs'

const getInstruction = (i: number) => {
  return `
  This is task ${i + 1}. To complete this task, you must:
  - Create a new file "task-${i + 1}.ts" in the test-outputs directory that contains the entry point of the program to complete the task.
  - The file should be executable with "bun test-outputs/task-${i + 1}.ts" and do what is described in the task.
  `.trim()
}

const prompts = [
  'Specify a complete node console game in a single file. Your goal is to make a game that is fun and interesting. You should put a lot of work into making it polished.',
  'Design a command-line tool that helps developers manage their git workflow more efficiently. Consider common git operations and how to simplify them.',
  'Create a markdown parser that converts markdown to HTML, focusing on the most commonly used markdown features. Make it simple but robust.',
  'Build a simple HTTP server that serves static files and implements basic caching. Focus on performance and proper HTTP header handling.',
].map((prompt, i) => `${getInstruction(i)}\n\n${prompt}`)

async function checkTaskFile(taskNumber: number) {
  // Create test output directory if it doesn't exist
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR)
  }

  const filename = `task-${taskNumber}.ts`
  const filepath = path.join(TEST_OUTPUT_DIR, filename)
  try {
    await fs.promises.access(filepath)
    console.log(`✅ Task ${taskNumber}: File ${filepath} was created successfully`)
    
    // Run TypeScript compiler to check if file is valid
    try {
      const tsc = spawn('bun', ['--cwd', '.', 'tsc', '--noEmit', filepath])
      
      let stderr = ''
      tsc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      await new Promise((resolve, reject) => {
        tsc.on('close', (code) => {
          if (code === 0) {
            console.log(`✅ Task ${taskNumber}: File ${filepath} is valid TypeScript`)
            resolve(null)
          } else {
            console.error(`❌ Task ${taskNumber}: File ${filepath} has TypeScript errors:`)
            console.error(stderr)
            reject(new Error('TypeScript validation failed'))
          }
        })
      })
    } catch (error) {
      // TypeScript errors are already logged above
    }
  } catch {
    console.error(`❌ Task ${taskNumber}: File ${filepath} was not created`)
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
