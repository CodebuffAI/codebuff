import {
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from 'node:fs'
import { checkTaskFile } from './tools'
import { runStrangeLoop } from './index'
import path from 'path'

const TEST_OUTPUT_DIR = 'test-outputs'
const getInstruction = (i: number) => {
  return `
  This is task ${i + 1}. To complete this task, you must:
  - Create a new file "task-${i + 1}.ts" in the current directory that contains the entry point of the program to complete the task.
  - The file should be executable with "bun test-outputs/task-${i + 1}.ts" and do what is described in the task.
  - The file must be created in the test-outputs directory, not in the root directory.
  `.trim()
}

// Clear the log file and clean test outputs at the start
try {
  // Clear log file
  writeFileSync('strange-loop.log', '')
  console.log('Cleared strange-loop.log')
  // Clear test output files
  if (existsSync(TEST_OUTPUT_DIR)) {
    const files = readdirSync(TEST_OUTPUT_DIR)
    for (const file of files) {
      unlinkSync(path.join(TEST_OUTPUT_DIR, file))
    }
    console.log('Cleared test output files')
  }
} catch (error) {
  console.error('Failed to clean up files:', error)
}

/**
 * Defines a scripted multi-turn interaction.
 * Each interaction includes:
 *  - description: Brief description for logging.
 *  - fileName: The expected output file (relative to TEST_OUTPUT_DIR), e.g. "task-1.ts".
 *  - script: An array of strings representing consecutive user prompts.
 *            The first element is the initial instruction; each subsequent string
 *            simulates a follow-up user response.
 *  - validateAfterTurn?: (turnIndex: number) => Promise<boolean> - Optional validation after each turn
 */
interface ScriptedInteraction {
  description: string
  fileName: string
  script: string[]
  validateAfterTurn?: (turnIndex: number) => Promise<boolean>
}

// Define one or more scripted interactions.
const interactions: ScriptedInteraction[] = [
  {
    description: 'Markdown parser multi-turn conversation',
    fileName: 'task-1.ts',
    script: [
      'Create a markdown parser that converts markdown to HTML.',
      'Now, adjust the parser to support inline code formatting.',
      'Finally, add support for unordered lists.',
    ].map((prompt, i) => `${getInstruction(i)}\n\n${prompt}`),
    validateAfterTurn: async (turnIndex) => {
      const filePath = path.join(TEST_OUTPUT_DIR, 'task-1.ts')
      // Check if file exists and passes type check
      const { success, msg } = await checkTaskFile(filePath, TEST_OUTPUT_DIR)
      console.log(
        `Turn ${turnIndex + 1} validation result: ${success}, message: ${msg}`
      )
      if (!success) return false

      // Could add more validation here specific to each turn
      return true
    },
  },
]

/**
 * Runs a single scripted interaction.
 * It simulates a back-and-forth conversation by sequentially appending simulated
 * user responses to the prompt and invoking runStrangeLoop on the aggregated conversation.
 * After all turns, it validates the resulting file using checkTaskFile.
 */
async function runScriptedInteraction(
  interaction: ScriptedInteraction
): Promise<boolean> {
  console.log(`Starting interaction: ${interaction.description}`)
  let currentContext: string | undefined
  let currentFiles: Array<{ path: string; content: string }> = []

  for (let i = 0; i < interaction.script.length; i++) {
    console.log(`\n--- Turn ${i + 1}/${interaction.script.length} ---`)

    try {
      // Run strange loop with previous context and files if available
      const result = await runStrangeLoop(
        interaction.script[i],
        process.cwd(),
        currentContext,
        currentFiles
      )
      currentContext = result.context
      currentFiles = result.files

      // Run turn-specific validation if provided
      if (interaction.validateAfterTurn) {
        const turnValid = await interaction.validateAfterTurn(i)
        if (!turnValid) {
          console.error(`❌ Turn ${i + 1} validation failed`)
          return false
        }
        console.log(`✅ Turn ${i + 1} validation passed`)
      }
    } catch (error) {
      console.error(`Error during turn ${i + 1}:`, error)
      return false
    }
  }

  return true
}

/**
 * Runs all scripted interactions sequentially and logs a summary.
 */
async function runAllInteractions() {
  const results = await Promise.all(
    interactions.map((interaction, index) => {
      console.log(
        `\nRunning scripted interaction ${index + 1}: ${interaction.description}`
      )
      return runScriptedInteraction(interaction)
    })
  )

  console.log('\nScripted Interaction Summary:')
  results.forEach((res, idx) => {
    console.log(`Interaction ${idx + 1}: ${res ? 'Completed' : 'Failed'}`)
  })

  console.log('\nAll scripted interactions completed.')
  return results
}

// Only run if this is the main module.
if (require.main === module) {
  runAllInteractions().catch(console.error)
}

export { runAllInteractions, runScriptedInteraction, ScriptedInteraction }
