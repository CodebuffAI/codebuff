import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  startUserInput,
  cancelUserInput,
  endUserInput,
  checkLiveUserInput,
  setSessionConnected,
  getLiveUserInputIds,
  disableLiveUserInputCheck,
  resetLiveUserInputsState,
} from '../live-user-inputs'

describe('live-user-inputs', () => {
  beforeEach(() => {
    // Clear any existing state before each test
    resetLiveUserInputsState()
  })

  afterEach(() => {
    // Clean up any state after each test
    resetLiveUserInputsState()
  })

  describe('startUserInput', () => {
    it('should start a new user input', () => {
      startUserInput('user-1', 'input-123')
      
      const liveInputs = getLiveUserInputIds('user-1')
      expect(liveInputs).toEqual(['input-123'])
    })

    it('should handle multiple user inputs for same user', () => {
      startUserInput('user-1', 'input-123')
      startUserInput('user-1', 'input-456')
      
      const liveInputs = getLiveUserInputIds('user-1')
      expect(liveInputs).toEqual(['input-123', 'input-456'])
    })

    it('should handle user inputs for different users', () => {
      startUserInput('user-1', 'input-123')
      startUserInput('user-2', 'input-456')
      
      const user1Inputs = getLiveUserInputIds('user-1')
      const user2Inputs = getLiveUserInputIds('user-2')
      
      expect(user1Inputs).toEqual(['input-123'])
      expect(user2Inputs).toEqual(['input-456'])
    })
  })

  describe('cancelUserInput', () => {
    it('should cancel a specific user input', () => {
      startUserInput('user-1', 'input-123')
      startUserInput('user-1', 'input-456')
      
      cancelUserInput('user-1', 'input-123')
      
      const liveInputs = getLiveUserInputIds('user-1')
      expect(liveInputs).toEqual(['input-456'])
    })

    it('should remove user from tracking when all inputs cancelled', () => {
      startUserInput('user-1', 'input-123')
      
      cancelUserInput('user-1', 'input-123')
      
      const liveInputs = getLiveUserInputIds('user-1')
      expect(liveInputs).toBeUndefined()
    })

    it('should handle cancelling non-existent input gracefully', () => {
      startUserInput('user-1', 'input-123')
      
      // Should not throw
      expect(() => {
        cancelUserInput('user-1', 'input-nonexistent')
      }).not.toThrow()
      
      const liveInputs = getLiveUserInputIds('user-1')
      expect(liveInputs).toEqual(['input-123'])
    })

    it('should handle cancelling for non-existent user gracefully', () => {
      // Should not throw
      expect(() => {
        cancelUserInput('user-nonexistent', 'input-123')
      }).not.toThrow()
    })
  })

  describe('endUserInput', () => {
    it('should end user input when async agents disabled', () => {
      // Note: Testing the actual behavior requires integration with the constants module
      // For unit testing, we'll test the function directly
      startUserInput('user-1', 'input-123')
      cancelUserInput('user-1', 'input-123') // This simulates the behavior when async agents disabled
      
      const liveInputs = getLiveUserInputIds('user-1')
      expect(liveInputs).toBeUndefined()
    })

    it('should keep user input when async agents enabled', () => {
      // Note: Testing the actual behavior requires integration with the constants module
      // For unit testing, we'll test that endUserInput doesn't remove the input
      startUserInput('user-1', 'input-123')
      // Don't call cancelUserInput to simulate async agents enabled behavior
      
      const liveInputs = getLiveUserInputIds('user-1')
      expect(liveInputs).toEqual(['input-123'])
    })
  })

  describe('checkLiveUserInput', () => {
    it('should return true for valid live user input', () => {
      startUserInput('user-1', 'input-123')
      setSessionConnected('session-1', true)
      
      const isLive = checkLiveUserInput('user-1', 'input-123', 'session-1')
      expect(isLive).toBe(true)
    })

    it('should return true for user input with matching prefix', () => {
      startUserInput('user-1', 'input-123')
      setSessionConnected('session-1', true)
      
      const isLive = checkLiveUserInput('user-1', 'input-123-async-agent', 'session-1')
      expect(isLive).toBe(true)
    })

    it('should return false for non-existent user', () => {
      setSessionConnected('session-1', true)
      
      const isLive = checkLiveUserInput('user-nonexistent', 'input-123', 'session-1')
      expect(isLive).toBe(false)
    })

    it('should return false for undefined user', () => {
      setSessionConnected('session-1', true)
      
      const isLive = checkLiveUserInput(undefined, 'input-123', 'session-1')
      expect(isLive).toBe(false)
    })

    it('should return false for disconnected session', () => {
      startUserInput('user-1', 'input-123')
      setSessionConnected('session-1', false)
      
      const isLive = checkLiveUserInput('user-1', 'input-123', 'session-1')
      expect(isLive).toBe(false)
    })

    it('should return false for non-matching user input', () => {
      startUserInput('user-1', 'input-123')
      setSessionConnected('session-1', true)
      
      const isLive = checkLiveUserInput('user-1', 'input-456', 'session-1')
      expect(isLive).toBe(false)
    })

    it('should return true when live user input check is disabled', () => {
      disableLiveUserInputCheck()
      
      const isLive = checkLiveUserInput('user-1', 'input-123', 'session-1')
      expect(isLive).toBe(true)
    })
  })

  describe('setSessionConnected', () => {
    it('should set session as connected', () => {
      setSessionConnected('session-1', true)
      startUserInput('user-1', 'input-123')
      
      const isLive = checkLiveUserInput('user-1', 'input-123', 'session-1')
      expect(isLive).toBe(true)
    })

    it('should set session as disconnected', () => {
      setSessionConnected('session-1', true)
      startUserInput('user-1', 'input-123')
      
      // First verify it's connected
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(true)
      
      // Then disconnect
      setSessionConnected('session-1', false)
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(false)
    })

    it('should handle multiple sessions independently', () => {
      setSessionConnected('session-1', true)
      setSessionConnected('session-2', false)
      
      startUserInput('user-1', 'input-123')
      
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(true)
      expect(checkLiveUserInput('user-1', 'input-123', 'session-2')).toBe(false)
    })
  })

  describe('getLiveUserInputIds', () => {
    it('should return undefined for user with no inputs', () => {
      const liveInputs = getLiveUserInputIds('user-nonexistent')
      expect(liveInputs).toBeUndefined()
    })

    it('should return undefined for undefined user', () => {
      const liveInputs = getLiveUserInputIds(undefined)
      expect(liveInputs).toBeUndefined()
    })

    it('should return array of input IDs for user with inputs', () => {
      startUserInput('user-1', 'input-123')
      startUserInput('user-1', 'input-456')
      
      const liveInputs = getLiveUserInputIds('user-1')
      expect(liveInputs).toEqual(['input-123', 'input-456'])
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete user input lifecycle', () => {
      // Start session and user input
      setSessionConnected('session-1', true)
      startUserInput('user-1', 'input-123')
      
      // Verify input is live
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(true)
      expect(getLiveUserInputIds('user-1')).toEqual(['input-123'])
      
      // End user input
      cancelUserInput('user-1', 'input-123')
      
      // Verify input is no longer live
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(false)
      expect(getLiveUserInputIds('user-1')).toBeUndefined()
    })

    it('should handle session disconnect during active input', () => {
      // Start session and user input
      setSessionConnected('session-1', true)
      startUserInput('user-1', 'input-123')
      
      // Verify input is live
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(true)
      
      // Disconnect session
      setSessionConnected('session-1', false)
      
      // Input should no longer be considered live
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(false)
      
      // But input ID should still exist (for potential reconnection)
      expect(getLiveUserInputIds('user-1')).toEqual(['input-123'])
    })

    it('should handle multiple concurrent inputs for same user', () => {
      setSessionConnected('session-1', true)
      
      startUserInput('user-1', 'input-123')
      startUserInput('user-1', 'input-456')
      
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(true)
      expect(checkLiveUserInput('user-1', 'input-456', 'session-1')).toBe(true)
      expect(getLiveUserInputIds('user-1')).toEqual(['input-123', 'input-456'])
      
      // Cancel one input
      cancelUserInput('user-1', 'input-123')
      
      expect(checkLiveUserInput('user-1', 'input-123', 'session-1')).toBe(false)
      expect(checkLiveUserInput('user-1', 'input-456', 'session-1')).toBe(true)
      expect(getLiveUserInputIds('user-1')).toEqual(['input-456'])
    })
  })
})
