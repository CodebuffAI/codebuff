import { writeFileSync } from 'fs'

const [pidPath, readyPath] = process.argv.slice(2)
if (!pidPath || !readyPath) process.exit(2)

process.on('SIGHUP', () => {})
process.on('SIGTERM', () => {})
writeFileSync(pidPath, String(process.pid))
writeFileSync(readyPath, 'ready')
setInterval(() => {}, 1_000)
