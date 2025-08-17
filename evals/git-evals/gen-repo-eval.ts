import { generateEvalFile } from './gen-evals'
import fs from 'fs'
import { pickCommits } from './pick-commits'

const main = async (repoUrl: string) => {
  console.log(`STEP 1: Picking commits for ${repoUrl}`)

  const selectedCommitsOutputPath = './selected-commits.json'
  const clientSessionId = `gen-repo-eval-${repoUrl}`
  await pickCommits({
    repoUrl,
    outputPath: selectedCommitsOutputPath,
    clientSessionId,
  })

  const selectedCommitsData = JSON.parse(
    fs.readFileSync(selectedCommitsOutputPath, 'utf8'),
  )
  const { repoUrl: gitRepoUrl, selectedCommits, repoName } = selectedCommitsData

  const outputPath = `eval-${repoName}.json`
  const evalInputs = selectedCommits.map((c: any) => ({
    commitSha: c.sha,
  }))

  console.log(
    `STEP 2: Generating eval file for ${repoUrl} with ${evalInputs.length} commits`,
  )

  await generateEvalFile({
    clientSessionId,
    repoUrl: gitRepoUrl,
    evalInputs,
    outputPath,
  })
}

if (require.main === module) {
  const repoUrl = process.argv[2]
  main(repoUrl)
}
