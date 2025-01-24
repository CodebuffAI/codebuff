import { test, expect, mock } from 'bun:test'
import { createBrowserActionXML, parseBrowserActionAttributes } from 'backend/src/browser-debugging'
import { sendBrowserInstruction } from 'backend/src/websockets/websocket-action'
import { BrowserAction } from 'common/src/browser-actions'
import { WebSocket } from 'ws'

// Unit tests for XML utilities
test('createBrowserActionXML generates correct XML for start action', () => {
  const action: BrowserAction = {
    type: 'start',
    url: 'https://example.com',
    headless: true,
    timeout: 5000
  }

  const xml = createBrowserActionXML(action)
  expect(xml).toBe('<browser_action action="start" url="https://example.com" headless="true" timeout="5000" />')
})

test('createBrowserActionXML generates correct XML for click action', () => {
  const action: BrowserAction = {
    type: 'click',
    selector: '#submit-button',
    waitForNavigation: true,
    button: 'left'
  }

  const xml = createBrowserActionXML(action)
  expect(xml).toBe('<browser_action action="click" selector="#submit-button" waitForNavigation="true" button="left" />')
})

test('parseBrowserActionAttributes correctly parses start action', () => {
  const attrs = {
    action: 'start',
    url: 'https://example.com',
    headless: 'true',
    timeout: '5000'
  }

  const action = parseBrowserActionAttributes(attrs)
  expect(action).toEqual({
    type: 'start',
    url: 'https://example.com',
    headless: true,
    timeout: 5000
  })
})

test('parseBrowserActionAttributes correctly parses click action', () => {
  const attrs = {
    action: 'click',
    selector: '#submit-button',
    waitForNavigation: 'true',
    button: 'left'
  }

  const action = parseBrowserActionAttributes(attrs)
  expect(action).toEqual({
    type: 'click',
    selector: '#submit-button',
    waitForNavigation: true,
    button: 'left'  // The function preserves all valid fields from input
  })
})

// Integration tests for WebSocket functionality
test('sendBrowserInstruction validates instruction before sending', () => {
  const mockSend = mock(() => {})
  const ws = {
    send: mockSend,
    readyState: WebSocket.OPEN,
    addEventListener: mock(() => {}),
    removeEventListener: mock(() => {}),
    close: mock(() => {})
  }

  const invalidInstruction = {
    type: 'start',
    // Missing required url field
    headless: true
  } as any

  expect(() => sendBrowserInstruction(ws as WebSocket, invalidInstruction))
    .toThrow('Invalid browser instruction')
})

test('sendBrowserInstruction sends valid instruction', () => {
  const mockSend = mock(() => {})
  const ws = {
    send: mockSend,
    readyState: WebSocket.OPEN,
    addEventListener: mock(() => {}),
    removeEventListener: mock(() => {}),
    close: mock(() => {})
  }

  const instruction: BrowserAction = {
    type: 'start',
    url: 'https://example.com',
    headless: true
  }

  sendBrowserInstruction(ws as WebSocket, instruction)
  expect(mockSend).toHaveBeenCalled()
})
