import { clearUserCredentials, getUserCredentials } from '../utils/auth'

export function logoutCommand(): void {
  const user = getUserCredentials()
  clearUserCredentials()

  if (user) {
    process.stderr.write(`✓ Logged out (was ${user.email})\n`)
  } else {
    process.stderr.write('Already logged out.\n')
  }
}
