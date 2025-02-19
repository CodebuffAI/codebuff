import { runStrangeLoop } from './index'
import { checkTaskFile } from './tools'
import fs from 'fs'
import path from 'path'

const TEST_OUTPUT_DIR = 'test-outputs'

// Clear the log file and clean test outputs at the start
try {
  // Clear log file
  fs.writeFileSync('strange-loop.log', '')
  console.log('Cleared strange-loop.log')

  // Clear test output files
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    const files = fs.readdirSync(TEST_OUTPUT_DIR)
    for (const file of files) {
      fs.unlinkSync(path.join(TEST_OUTPUT_DIR, file))
    }
    console.log('Cleared test output files')
  }
} catch (error) {
  console.error('Failed to clean up files:', error)
}

const getInstruction = (i: number) => {
  return `
  This is task ${i + 1}. To complete this task, you must:
  - Create a new file "task-${i + 1}.ts" in the test-outputs directory that contains the entry point of the program to complete the task.
  - The file should be executable with "bun test-outputs/task-${i + 1}.ts" and do what is described in the task.
  - The file must be created in the test-outputs directory, not in the root directory.
  - Review and type check the file before finishing.
  `.trim()
}

const prompts = [
  `Specify a complete node console game. Your goal is to make a game that is fun and interesting.
You should put a lot of work into making it polished. After creating it, you should try to make it even better.
Create it with typescript.`,
  // 'Design a command-line tool that helps developers manage their git workflow more efficiently. Consider common git operations and how to simplify them.',
  // 'Create a markdown parser that converts markdown to HTML, focusing on the most commonly used markdown features. Make it simple but robust.',
  // 'Build a simple HTTP server that serves static files and implements basic caching. Focus on performance and proper HTTP header handling.',
].map((prompt, i) => `${getInstruction(i)}\n\n${prompt}`)

async function runAllPrompts() {
  const results = await Promise.all(
    prompts.map((prompt, i) => {
      console.log(`Starting prompt ${i + 1}...`)
      return runStrangeLoop(prompt, TEST_OUTPUT_DIR)
        .then(async () => {
          const filePath = path.join(TEST_OUTPUT_DIR, `task-${i + 1}.ts`)
          const success = await checkTaskFile(filePath, TEST_OUTPUT_DIR)
          if (!success) {
            console.error(`❌ Task ${i + 1} validation failed`)
          }
          return success
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
