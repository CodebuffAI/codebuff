import { describe, expect, test } from 'bun:test'

import {
  abortActiveRun,
  clearActiveRunAborter,
  setActiveRunAborter,
} from '../active-run'

describe('active-run registry', () => {
  test('tracks and aborts the registered run across component lifetimes', () => {
    let aborted = false
    setActiveRunAborter('run-1', () => {
      aborted = true
    })

    try {
      abortActiveRun()
      expect(aborted).toBe(true)
    } finally {
      clearActiveRunAborter('run-1')
    }
  })

  test('does not let a stale owner clear a newer run', () => {
    let aborted = false
    setActiveRunAborter('run-new', () => {
      aborted = true
    })

    try {
      clearActiveRunAborter('run-old')
      abortActiveRun()
      expect(aborted).toBe(true)
    } finally {
      clearActiveRunAborter('run-new')
    }
  })
})
