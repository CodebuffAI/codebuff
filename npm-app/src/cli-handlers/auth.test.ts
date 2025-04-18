// @ts-ignore: bun:test types aren't available
import { test, expect, mock, spyOn } from 'bun:test'
import { handleLogin, handleLogout } from './auth'
import { checkpointManager } from '../checkpoints/checkpoint-manager'

// Mock the Client class
class MockClient {
  async login() {}
  async logout() {}
}

test('handleLogin calls client.login and clears checkpoints', async () => {
  // Setup
  const client = new MockClient()
  const loginSpy = spyOn(client, 'login')
  const clearCheckpointsSpy = spyOn(checkpointManager, 'clearCheckpoints')

  // Execute
  await handleLogin(client as any)

  // Verify
  expect(loginSpy).toHaveBeenCalled()
  expect(clearCheckpointsSpy).toHaveBeenCalled()
})

test('handleLogout calls client.logout and returns control to user', async () => {
  // Setup
  const client = new MockClient()
  const logoutSpy = spyOn(client, 'logout')
  const returnControlToUser = mock(() => {})

  // Execute
  await handleLogout(client as any, returnControlToUser)

  // Verify
  expect(logoutSpy).toHaveBeenCalled()
  expect(returnControlToUser).toHaveBeenCalled()
})

test('handleLogin propagates errors from client.login', async () => {
  // Setup
  const client = new MockClient()
  const error = new Error('Login failed')
  spyOn(client, 'login').mockImplementation(() => {
    throw error
  })

  // Execute and verify
  await expect(handleLogin(client as any)).rejects.toThrow('Login failed')
})

test('handleLogout propagates errors from client.logout', async () => {
  // Setup
  const client = new MockClient()
  const error = new Error('Logout failed')
  spyOn(client, 'logout').mockImplementation(() => {
    throw error
  })
  const returnControlToUser = mock(() => {})

  // Execute and verify
  await expect(
    handleLogout(client as any, returnControlToUser)
  ).rejects.toThrow('Logout failed')
  expect(returnControlToUser).not.toHaveBeenCalled()
})