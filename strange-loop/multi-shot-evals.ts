import { runStrangeLoop } from './index'
import fs from 'fs'
import path from 'path'
import { checkTaskFile } from 'tools'

const TEST_OUTPUT_DIR = 'test-outputs'
const getInstruction = (i: number, previousContent?: string) => {
  const baseInstruction = `
  This is task ${i + 1}. To complete this task, you must:
  - Create a new file "task-${i + 1}.ts" in the current directory that contains the entry point of the program to complete the task.
  - The file should be executable with "bun test-outputs/task-${i + 1}.ts" and do what is described in the task.
  - The file must be created in the test-outputs directory, not in the root directory.
  `.trim()

  // If we have previous content, include it in the instruction
  if (previousContent) {
    return `${baseInstruction}\n\nHere is the current content of task-${i + 1}.ts that you should modify:\n\n${previousContent}`
  }
  return baseInstruction
}

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
    ],
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

  for (let i = 0; i < interaction.script.length; i++) {
    console.log(`\n--- Turn ${i + 1}/${interaction.script.length} ---`)

    // Get the current content of the file if it exists
    const filePath = path.join(TEST_OUTPUT_DIR, interaction.fileName)
    let previousContent: string | undefined
    try {
      previousContent = await fs.promises.readFile(filePath, 'utf-8')
      console.log('Found existing file content to build upon')
    } catch (error) {
      console.log('No existing file found, starting fresh')
    }

    // Build the instruction with previous content if available
    const fullInstruction = `${getInstruction(i, previousContent)}\n\n${interaction.script[i]}`
    
    try {
      await runStrangeLoop(fullInstruction)

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

  // Final validation
  const filePath = path.join(TEST_OUTPUT_DIR, interaction.fileName)
  const { success, msg } = await checkTaskFile(filePath, TEST_OUTPUT_DIR)
  if (!success) {
    console.error(
      `❌ Final validation failed for "${interaction.description}": ${msg}`
    )
  } else {
    console.log(
      `✅ Interaction "${interaction.description}" completed successfully.`
    )
  }
  return success
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
if (import.meta.url === import.meta.resolve('./multi-shot-evals.ts')) {
  runAllInteractions().catch(console.error)
}

export { runAllInteractions, runScriptedInteraction, ScriptedInteraction }
