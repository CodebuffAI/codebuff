import { spawn } from 'cross-spawn'

export async function spawnLocal(
  executable: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv
    stdio: 'inherit' | 'ignore'
    cwd: string
    stdin?: string
  }
): Promise<void> {
  const stdioOption = options.stdin !== undefined ? ['pipe' as const, options.stdio, options.stdio] : options.stdio

  const child = spawn(executable, [...args], {
    stdio: stdioOption,
    env: options.env,
    cwd: options.cwd,
  })

  if (options.stdin !== undefined && child.stdin) {
    child.stdin.on('error', (err: any) => {
      if (err.code !== 'EPIPE') {
        throw err
      }
      // Swallow EPIPE: child may exit before consuming all stdin
    })
    child.stdin.write(options.stdin)
    child.stdin.end()
  }

  await new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Command failed with code ${code}`))
      }
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}
