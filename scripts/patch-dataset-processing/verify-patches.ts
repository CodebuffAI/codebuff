import * as fs from 'fs'
import * as path from 'path'
import { applyPatch } from '../../common/src/util/patch'

function verifyPatches() {
  const datasetDir = path.join(__dirname, '..', 'data', 'processed_dataset')
  const dirs = fs.readdirSync(datasetDir)

  for (const dir of dirs) {
    const oldFile = path.join(datasetDir, dir, 'old_file')
    const newFile = path.join(datasetDir, dir, 'new_file')
    const patchFile = path.join(datasetDir, dir, 'patch')
    const updatedPatchFile = path.join(datasetDir, dir, 'updated_patch')

    if (
      fs.existsSync(oldFile) &&
      fs.existsSync(newFile) &&
      fs.existsSync(patchFile) &&
      fs.existsSync(updatedPatchFile)
    ) {
      const oldContent = fs.readFileSync(oldFile, 'utf-8')
      const newContent = fs.readFileSync(newFile, 'utf-8')
      const patchContent = fs.readFileSync(patchFile, 'utf-8')
      const updatedPatchContent = fs.readFileSync(updatedPatchFile, 'utf-8')

      const patchedContent = applyPatch(oldContent, patchContent)
      const updatedPatchedContent = applyPatch(oldContent, updatedPatchContent)

      if (
        patchedContent === newContent &&
        updatedPatchedContent === newContent
      ) {
        // console.log(`Verification successful for ${dir}`);
      } else {
        console.error(`Verification failed for ${dir}`)
        if (patchedContent !== newContent) {
          console.error('  Original patch mismatch')
        }
        if (updatedPatchedContent !== newContent) {
          console.error('  Updated patch mismatch')
          console.error('patch', patchContent)
          console.error('updated patch', updatedPatchContent)
        }
      }
    }
  }
}

verifyPatches()
