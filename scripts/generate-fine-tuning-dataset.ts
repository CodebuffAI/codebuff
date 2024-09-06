import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { promptClaudeWithContinuation } from '../backend/src/claude'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') })

const MANICODE_PROJECT_PATH = '/Users/jahooma/manicode'
const MANIFOLD_PROJECT_PATH = '/Users/jahooma/manifold'
const NUMBER_OF_COMMITS = 1000
const FILES_TO_PROCESS = 100
const PARALLEL_PROCESSES = 3

interface DatasetEntry {
  oldFile: string
  newFile: string
  patch: string
  claudeSketch: string
}

async function generateClaudeSketch(
  oldContent: string,
  newContent: string,
  patch: string
): Promise<string> {
  const prompt = `
You are an expert programmer tasked with explaining how to modify an old version of a file into a new version. Your explanation should be clear and concise, suitable for a human to understand and follow.

Here's the old version of the file:

\`\`\`
${oldContent}
\`\`\`

Here's the new version of the file:

\`\`\`
${newContent}
\`\`\`

Here's the patch showing the differences:

\`\`\`
${patch}
\`\`\`

Please provide a sketch of how to turn the old file into the new file. First, explain the changes in a <discussion> block. Then, write out the new file in a <file> block, but use comments like "// ... existing code ..." for sections that were unchanged. Explain the changes as if you were instructing a human on how to modify the old file into the new file.
`

  const { response } = await promptClaudeWithContinuation(
    [{ role: 'user', content: prompt }],
    { userId: 'fine-tuning-dataset-generator' }
  )

  // Extract the content from the <file> block
  const fileContentMatch = response.match(/<file>([\s\S]*?)<\/file>/)
  return fileContentMatch ? fileContentMatch[1].trim() : ''
}

const createDataset = async () => {
  console.log('Creating dataset...')
  const dataset: DatasetEntry[] = []

  // Create tmp directory if it doesn't exist
  const tmpDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir)
  }

  // Check if ANTHROPIC_API_KEY is set
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Error: ANTHROPIC_API_KEY is not set. Please set this environment variable before running the script.'
    )
    return
  }

  // Change to the Manifold project directory
  try {
    process.chdir(MANIFOLD_PROJECT_PATH)
    console.log(`Changed to directory: ${MANIFOLD_PROJECT_PATH}`)
  } catch (error) {
    console.error(
      `Failed to change to directory ${MANIFOLD_PROJECT_PATH}:`,
      error
    )
    return
  }

  // Get the last 1000 commit hashes
  const allCommitHashes = execSync(
    `git log -n ${NUMBER_OF_COMMITS} --pretty=format:"%H"`
  )
    .toString()
    .split('\n')

  // Get all changed files from the last 1000 commits
  const allChangedFiles = allCommitHashes.flatMap(commitHash => 
    execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`)
      .toString()
      .split('\n')
      .filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
  )

  // Randomly select 100 unique files
  const filesToProcess = [...new Set(allChangedFiles)]
    .sort(() => 0.5 - Math.random())
    .slice(0, FILES_TO_PROCESS)

  console.log(`Randomly selected ${filesToProcess.length} files to process.`)

  // Process files in parallel
  for (let i = 0; i < filesToProcess.length; i += PARALLEL_PROCESSES) {
    const batch = filesToProcess.slice(i, i + PARALLEL_PROCESSES)
    await Promise.all(batch.map(async (file) => {
      try {
        console.log(`Processing file: ${file}`)
        const commitHash = execSync(`git log -n 1 --pretty=format:"%H" -- ${file}`).toString()
        
        // Get the file content before and after the commit
        const oldContent = execSync(`git show ${commitHash}^:${file}`).toString()
        const newContent = execSync(`git show ${commitHash}:${file}`).toString()

        // Generate the git diff patch
        const patch = execSync(`git diff ${commitHash}^ ${commitHash} -- ${file}`).toString()

        // Generate Claude sketch
        console.log(`Generating Claude sketch for ${file}`)
        const claudeSketch = await generateClaudeSketch(oldContent, newContent, patch)

        // Save Claude's sketch to a file in the tmp directory
        const sketchFileName = `${commitHash}_${file.replace(/\//g, '_')}.txt`
        const sketchFilePath = path.join(tmpDir, sketchFileName)
        fs.writeFileSync(sketchFilePath, claudeSketch)
        console.log(`Saved Claude's sketch to ${sketchFilePath}`)

        dataset.push({
          oldFile: oldContent,
          newFile: newContent,
          patch: patch,
          claudeSketch: claudeSketch,
        })
        console.log(`Added entry for ${file} to dataset.`)
      } catch (error: any) {
        console.error(`Error processing file ${file}:`, error.message)
      }
    }))
  }

  process.chdir(MANICODE_PROJECT_PATH)

  // Save the dataset to a JSON file
  const outputPath = path.join(process.cwd(), 'fine_tuning_dataset.json')
  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2))

  console.log(`Dataset created with ${dataset.length} entries.`)
  console.log(`Dataset saved to: ${outputPath}`)
}

createDataset().catch(console.error)
