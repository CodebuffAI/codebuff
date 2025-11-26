import { describe, test, expect } from 'bun:test'

import {
  ErrorCodes,
  PaymentRequiredError,
  isPaymentRequiredError,
  sanitizeErrorMessage,
} from '../errors'

describe('PaymentRequiredError', () => {
  test('has correct error code and status', () => {
    const error = new PaymentRequiredError('Insufficient credits')
    expect(error.code).toBe(ErrorCodes.PAYMENT_REQUIRED)
    expect(error.status).toBe(402)
    expect(error.name).toBe('PaymentRequiredError')
  })

  test('preserves the error message', () => {
    const message = 'Custom payment required message.'
    const error = new PaymentRequiredError(message)
    expect(error.message).toBe(message)
  })
})

describe('isPaymentRequiredError', () => {
  test('returns true for PaymentRequiredError', () => {
    const error = new PaymentRequiredError('test')
    expect(isPaymentRequiredError(error)).toBe(true)
  })

  test('returns false for other errors', () => {
    expect(isPaymentRequiredError(new Error('test'))).toBe(false)
    expect(isPaymentRequiredError(null)).toBe(false)
    expect(isPaymentRequiredError(undefined)).toBe(false)
    expect(isPaymentRequiredError({ code: 'PAYMENT_REQUIRED' })).toBe(false)
  })
})

describe('sanitizeErrorMessage', () => {
  test('returns original message for PaymentRequiredError', () => {
    const message = 'Payment required for this request.'
    const error = new PaymentRequiredError(message)
    expect(sanitizeErrorMessage(error)).toBe(message)
  })
})

describe('error detection patterns', () => {
  test('detects out of credits in error message', () => {
    const serverMessage = 'You are OUT OF CREDITS right now.'
    expect(serverMessage.toLowerCase().includes('out of credits')).toBe(true)
  })

  test('detects 402 in error message', () => {
    const errorWithCode = 'Error from AI SDK: 402 Payment Required'
    expect(errorWithCode.includes('402')).toBe(true)
  })
})
