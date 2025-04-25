import * as fs from 'fs'
import * as path from 'path'

const inputDir = path.join(__dirname, '..', 'data', 'processed_dataset')
const outputFile = path.join(__dirname, '..', 'data', 'raw_dataset.json')

interface DataEntry {
  project: string
  filePath: string
  oldFile: string
  claudeSketch: string
  patch: string
  updatedPatch: string
  newFile: string
  updatedSketch: string
}

function processDataset() {
  const rawData: DataEntry[] = []
  const dirs = fs.readdirSync(inputDir)

  dirs.forEach((dir) => {
    const [project, ...filePathParts] = dir.split('_')
    const filePath = filePathParts.join('_')
    const entryDir = path.join(inputDir, dir)

    const entry: DataEntry = {
      project,
      filePath,
      oldFile: fs.readFileSync(path.join(entryDir, 'old_file'), 'utf-8'),
      claudeSketch: fs.readFileSync(path.join(entryDir, 'sketch'), 'utf-8'),
      patch: fs.readFileSync(path.join(entryDir, 'patch'), 'utf-8'),
      updatedPatch: fs.readFileSync(
        path.join(entryDir, 'updated_patch'),
        'utf-8'
      ),
      newFile: fs.readFileSync(path.join(entryDir, 'new_file'), 'utf-8'),
      updatedSketch: fs.readFileSync(
        path.join(entryDir, 'updated_sketch'),
        'utf-8'
      ),
    }

    rawData.push(entry)
  })

  fs.writeFileSync(outputFile, JSON.stringify(rawData, null, 2))
  console.log(`Dataset processing complete. Output file: ${outputFile}`)
}

processDataset()
