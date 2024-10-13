import * as fs from 'fs'
import * as path from 'path'
import { replaceNonStandardPlaceholderComments2 } from '../../common/src/util/string'

function updateSketch(sketchContent: string): string {
  return replaceNonStandardPlaceholderComments2(
    sketchContent,
    '[[**REPLACE_WITH_EXISTING_CODE**]]'
  )
}

function processDatasetSketches() {
  const datasetDir = path.join(__dirname, '..', 'data', 'processed_dataset')
  const dirs = fs.readdirSync(datasetDir)

  for (const dir of dirs) {
    const sketchFile = path.join(datasetDir, dir, 'sketch')
    if (fs.existsSync(sketchFile)) {
      const sketchContent = fs.readFileSync(sketchFile, 'utf-8')
      const updatedSketchContent = updateSketch(sketchContent)
      const updatedSketchFile = path.join(datasetDir, dir, 'updated_sketch')
      fs.writeFileSync(updatedSketchFile, updatedSketchContent)
      console.log(`Updated sketch file created: ${updatedSketchFile}`)
    }
  }
}

processDatasetSketches()
