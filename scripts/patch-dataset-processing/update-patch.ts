const fs = require('fs')
const path = require('path')

function updatePatch(patchContent: string): string {
  // Remove the trailing newline if it exists
  let hadTrailingNewline = false
  if (patchContent.endsWith('\n')) {
    patchContent = patchContent.slice(0, -1)
    hadTrailingNewline = true
  }

  const lines = patchContent.split('\n')
  const updatedLines: string[] = []
  let inHunk = false
  let hunkLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (inHunk) {
        updatedLines.push(...hunkLines.slice(0, -3))
      }
      inHunk = true
      hunkLines = [line]
    } else if (inHunk) {
      hunkLines.push(line)
    } else {
      updatedLines.push(line)
    }
  }

  if (inHunk) {
    const keepUntilIndex =
      hunkLines.findLastIndex(
        (line) => line.startsWith('+') || line.startsWith('-')
      ) + 1
    updatedLines.push(...hunkLines.slice(0, keepUntilIndex))
  }

  // Add the newline back at the end
  return updatedLines.join('\n') + (hadTrailingNewline ? '\n' : '')
}

function processDatasetPatches() {
  const datasetDir = path.join(__dirname, '..', 'data', 'processed_dataset')
  const dirs = fs.readdirSync(datasetDir)

  for (const dir of dirs) {
    const patchFile = path.join(datasetDir, dir, 'patch')
    if (fs.existsSync(patchFile)) {
      const patchContent = fs.readFileSync(patchFile, 'utf-8')
      const updatedPatchContent = updatePatch(patchContent)
      const updatedPatchFile = path.join(datasetDir, dir, 'updated_patch')
      fs.writeFileSync(updatedPatchFile, updatedPatchContent)
      console.log(`Updated patch file created: ${updatedPatchFile}`)
    }
  }
}

processDatasetPatches()
