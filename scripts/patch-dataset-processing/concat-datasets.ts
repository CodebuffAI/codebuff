import * as fs from 'fs'
import * as path from 'path'

const dataDir = path.join(__dirname, 'data')
const outputFile = path.join(__dirname, 'raw_dataset.json')

const datasets = [
  { file: 'fine_tuning_dataset_litestar.json', project: 'litestar' },
  { file: 'fine_tuning_dataset_manifold.json', project: 'manifold' },
  { file: 'fine_tuning_dataset_nushell.json', project: 'nushell' },
]

let combinedData: any[] = []

datasets.forEach(({ file, project }) => {
  const filePath = path.join(dataDir, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const dataWithProject = data.map((item: any) => ({ ...item, project }))
  combinedData = combinedData.concat(dataWithProject)
})

fs.writeFileSync(outputFile, JSON.stringify(combinedData, null, 2))

console.log(`Combined dataset saved to ${outputFile}`)
