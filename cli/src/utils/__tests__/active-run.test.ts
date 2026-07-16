import { describe, expect, test } from 'bun:test'

import {
  abortActiveRun,
  clearActiveRunAborter,
  hasActiveRun,
  setActiveRunAborter,
} from '../active-run'

describe('active-run registry', () => {
  test('tracks and aborts the registered run across component lifetimes', () => {
    let aborted = false
    setActiveRunAborter('run-1', () => {
      aborted = true
    })

    try {
      expect(hasActiveRun()).toBe(true)
      abortActiveRun()
      expect(aborted).toBe(true)
    } finally {
      clearActiveRunAborter('run-1')
    }

    expect(hasActiveRun()).toBe(false)
  })

  test('does not let a stale owner clear a newer run', () => {
    setActiveRunAborter('run-new', () => {})

    try {
      clearActiveRunAborter('run-old')
      expect(hasActiveRun()).toBe(true)
    } finally {
      clearActiveRunAborter('run-new')
    }
  })
})
