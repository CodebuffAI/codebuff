import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { describe, it, expect, beforeEach } from 'bun:test'

import {
  startUserInput,
  cancelUserInput,
  checkLiveUserInput,
  setSessionConnected,
  getLiveUserInputIds,
  disableLiveUserInputCheck,
  resetLiveUserInputsState,
} from '../live-user-inputs'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type {
  UserInputRecord,
  SessionRecord,
} from '@codebuff/common/types/contracts/live-user-input'

let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

describe('live-user-inputs', () => {
  let liveUserInputRecord: UserInputRecord
  let sessionConnections: SessionRecord

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }
    liveUserInputRecord = {}
    sessionConnections = {}
    resetLiveUserInputsState({ liveUserInputRecord, sessionConnections })
  })

  describe('startUserInput', () => {
    it('should start a new user input', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      const liveInputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      expect(liveInputs).toEqual(['input-123'])
    })

    it('should handle multiple user inputs for same user', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-456',
        liveUserInputRecord,
      })

      const liveInputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      expect(liveInputs).toEqual(['input-123', 'input-456'])
    })

    it('should handle user inputs for different users', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      startUserInput({
        userId: 'user-2',
        userInputId: 'input-456',
        liveUserInputRecord,
      })

      const user1Inputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      const user2Inputs = getLiveUserInputIds({
        userId: 'user-2',
        liveUserInputRecord,
      })

      expect(user1Inputs).toEqual(['input-123'])
      expect(user2Inputs).toEqual(['input-456'])
    })
  })

  describe('cancelUserInput', () => {
    it('should cancel a specific user input', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-456',
        liveUserInputRecord,
      })

      cancelUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      const liveInputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      expect(liveInputs).toEqual(['input-456'])
    })

    it('should remove user from tracking when all inputs cancelled', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      cancelUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      const liveInputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      expect(liveInputs).toBeUndefined()
    })

    it('should handle cancelling non-existent input gracefully', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      // Should not throw
      expect(() => {
        cancelUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-nonexistent',
          liveUserInputRecord,
        })
      }).not.toThrow()

      const liveInputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      expect(liveInputs).toEqual(['input-123'])
    })

    it('should handle cancelling for non-existent user gracefully', () => {
      // Should not throw
      expect(() => {
        cancelUserInput({
          ...agentRuntimeImpl,
          userId: 'user-nonexistent',
          userInputId: 'input-123',
          liveUserInputRecord,
        })
      }).not.toThrow()
    })
  })

  describe('endUserInput', () => {
    it('should end user input when async agents disabled', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      cancelUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      const liveInputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      expect(liveInputs).toBeUndefined()
    })

    it('should keep user input when async agents enabled', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      const liveInputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      expect(liveInputs).toEqual(['input-123'])
    })
  })

  describe('checkLiveUserInput', () => {
    it('should return true for valid live user input', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })

      const isLive = checkLiveUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        clientSessionId: 'session-1',
        liveUserInputRecord,
        sessionConnections,
      })
      expect(isLive).toBe(true)
    })

    it('should return true for user input with matching prefix', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })

      const isLive = checkLiveUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123-async-agent',
        clientSessionId: 'session-1',
        liveUserInputRecord,
        sessionConnections,
      })
      expect(isLive).toBe(true)
    })

    it('should return false for non-existent user', () => {
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })

      const isLive = checkLiveUserInput({
        ...agentRuntimeImpl,
        userId: 'user-nonexistent',
        userInputId: 'input-123',
        clientSessionId: 'session-1',
        liveUserInputRecord,
        sessionConnections,
      })
      expect(isLive).toBe(false)
    })

    it('should return false for undefined user', () => {
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })

      const isLive = checkLiveUserInput({
        ...agentRuntimeImpl,
        userId: undefined,
        userInputId: 'input-123',
        clientSessionId: 'session-1',
        liveUserInputRecord,
        sessionConnections,
      })
      expect(isLive).toBe(false)
    })

    it('should return false for disconnected session', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      setSessionConnected({
        sessionId: 'session-1',
        connected: false,
        sessionConnections,
      })

      const isLive = checkLiveUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        clientSessionId: 'session-1',
        liveUserInputRecord,
        sessionConnections,
      })
      expect(isLive).toBe(false)
    })

    it('should return false for non-matching user input', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })

      const isLive = checkLiveUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-456',
        clientSessionId: 'session-1',
        liveUserInputRecord,
        sessionConnections,
      })
      expect(isLive).toBe(false)
    })

    it('should return true when live user input check is disabled', () => {
      disableLiveUserInputCheck()

      const isLive = checkLiveUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        clientSessionId: 'session-1',
        liveUserInputRecord,
        sessionConnections,
      })
      expect(isLive).toBe(true)
    })
  })

  describe('setSessionConnected', () => {
    it('should set session as connected', () => {
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      const isLive = checkLiveUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        clientSessionId: 'session-1',
        liveUserInputRecord,
        sessionConnections,
      })
      expect(isLive).toBe(true)
    })

    it('should set session as disconnected', () => {
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      // First verify it's connected
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(true)

      // Then disconnect
      setSessionConnected({
        sessionId: 'session-1',
        connected: false,
        sessionConnections,
      })
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(false)
    })

    it('should handle multiple sessions independently', () => {
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })
      setSessionConnected({
        sessionId: 'session-2',
        connected: false,
        sessionConnections,
      })

      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(true)
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-2',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(false)
    })
  })

  describe('getLiveUserInputIds', () => {
    it('should return undefined for user with no inputs', () => {
      const liveInputs = getLiveUserInputIds({
        userId: 'user-nonexistent',
        liveUserInputRecord,
      })
      expect(liveInputs).toBeUndefined()
    })

    it('should return undefined for undefined user', () => {
      const liveInputs = getLiveUserInputIds({
        userId: undefined,
        liveUserInputRecord,
      })
      expect(liveInputs).toBeUndefined()
    })

    it('should return array of input IDs for user with inputs', () => {
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-456',
        liveUserInputRecord,
      })

      const liveInputs = getLiveUserInputIds({
        userId: 'user-1',
        liveUserInputRecord,
      })
      expect(liveInputs).toEqual(['input-123', 'input-456'])
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete user input lifecycle', () => {
      // Start session and user input
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      // Verify input is live
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(true)
      expect(
        getLiveUserInputIds({ userId: 'user-1', liveUserInputRecord }),
      ).toEqual(['input-123'])

      // End user input
      cancelUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      // Verify input is no longer live
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(false)
      expect(
        getLiveUserInputIds({ userId: 'user-1', liveUserInputRecord }),
      ).toBeUndefined()
    })

    it('should handle session disconnect during active input', () => {
      // Start session and user input
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      // Verify input is live
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(true)

      // Disconnect session
      setSessionConnected({
        sessionId: 'session-1',
        connected: false,
        sessionConnections,
      })

      // Input should no longer be considered live
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(false)

      // But input ID should still exist (for potential reconnection)
      expect(
        getLiveUserInputIds({ userId: 'user-1', liveUserInputRecord }),
      ).toEqual(['input-123'])
    })

    it('should handle multiple concurrent inputs for same user', () => {
      setSessionConnected({
        sessionId: 'session-1',
        connected: true,
        sessionConnections,
      })

      startUserInput({
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })
      startUserInput({
        userId: 'user-1',
        userInputId: 'input-456',
        liveUserInputRecord,
      })

      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(true)
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-456',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(true)
      expect(
        getLiveUserInputIds({ userId: 'user-1', liveUserInputRecord }),
      ).toEqual(['input-123', 'input-456'])

      // Cancel one input
      cancelUserInput({
        ...agentRuntimeImpl,
        userId: 'user-1',
        userInputId: 'input-123',
        liveUserInputRecord,
      })

      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-123',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(false)
      expect(
        checkLiveUserInput({
          ...agentRuntimeImpl,
          userId: 'user-1',
          userInputId: 'input-456',
          clientSessionId: 'session-1',
          liveUserInputRecord,
          sessionConnections,
        }),
      ).toBe(true)
      expect(
        getLiveUserInputIds({ userId: 'user-1', liveUserInputRecord }),
      ).toEqual(['input-456'])
    })
  })
})
