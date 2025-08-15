import { generateEvalFile } from './gen-evals'
import fs from 'fs'

const main = async (filteredCommitsJsonPath: string) => {
  // Load makeplane-commits.json
  const makeplaneRepoCommits = JSON.parse(
    fs.readFileSync(filteredCommitsJsonPath, 'utf8'),
  )
  const { repoUrl, selectedCommits, repoName } = makeplaneRepoCommits
  const outputPath = `${repoName}-eval.json`
  const evalInputs = selectedCommits.map((c: any) => ({
    commitSha: c.sha,
  }))
  const clientSessionId = `gen-repo-eval-${repoName}`

  console.log(
    `Generating eval file for ${repoUrl} with ${evalInputs.length} commits`,
  )

  await generateEvalFile({
    clientSessionId,
    repoUrl,
    evalInputs,
    outputPath,
  })
}

if (require.main === module) {
  const filteredCommitsJsonPath = './makeplane-commits.json'
  main(filteredCommitsJsonPath)
}
