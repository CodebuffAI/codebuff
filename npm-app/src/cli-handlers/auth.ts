import { Client } from '../client'
import { checkpointManager } from '../checkpoints/checkpoint-manager'

/**
 * Handle the login command
 */
export async function handleLogin(client: Client): Promise<void> {
  await client.login()
  checkpointManager.clearCheckpoints()
}

/**
 * Handle the logout command
 */
export async function handleLogout(client: Client, returnControlToUser: () => void): Promise<void> {
  await client.logout()
  returnControlToUser()
}