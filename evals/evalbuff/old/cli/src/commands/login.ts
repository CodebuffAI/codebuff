import { loginFlow, getUserCredentials } from '../utils/auth'
import { printError } from '../utils/output'

export async function loginCommand(): Promise<void> {
  try {
    const existing = getUserCredentials()
    if (existing) {
      process.stderr.write(
        `Already logged in as ${existing.email}. Run "evalbuff logout" first to switch accounts.\n`,
      )
      return
    }

    const user = await loginFlow()
    process.stderr.write(`\n✓ Logged in as ${user.email}\n`)
  } catch (error) {
    printError(
      error instanceof Error ? error.message : 'Login failed.',
    )
    process.exit(2)
  }
}
