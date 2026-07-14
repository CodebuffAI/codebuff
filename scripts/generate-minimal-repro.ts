import fs from 'node:fs'
import path from 'node:path'

const [name, command, ...files] = process.argv.slice(2)
if (!name || !command) {
  console.error(
    'Usage: bun scripts/generate-minimal-repro.ts <name> <command> [file...]',
  )
  process.exit(2)
}
if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('Invalid repro name')
const dir = path.join('.agents', 'repros', name)
fs.mkdirSync(dir, { recursive: true })
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  command,
  files,
  expected: 'Describe the expected result before running this reproduction.',
  actual: 'Record the observed result and exact diagnostics.',
}
fs.writeFileSync(
  path.join(dir, 'repro.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
fs.writeFileSync(
  path.join(dir, 'README.md'),
  `# ${name}\n\nRun: \`${command}\`\n\nFiles:\n${files.map((file) => `- ${file}`).join('\n')}\n`,
)
console.log(dir)
