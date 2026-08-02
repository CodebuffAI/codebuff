import { writeFileSync } from 'fs'

const [pidPath] = process.argv.slice(2)
if (!pidPath) process.exit(2)

writeFileSync(pidPath, String(process.pid))
setInterval(() => {}, 1_000)
