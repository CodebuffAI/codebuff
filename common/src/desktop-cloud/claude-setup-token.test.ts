import { expect, test } from 'bun:test'

import {
  isSetupTokenCode,
  plainTerminalText,
  setupTokenFrom,
  setupTokenOutputTail,
  setupTokenSignInUrl,
  terminalScreenText,
} from './claude-setup-token'

const URL_LINE =
  'https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&state=abc'

test('the sign-in link is read once it is complete, through escape sequences', () => {
  // Captured shape: Claude Code 2.1.296 with no browser to open.
  expect(setupTokenSignInUrl(`Browser didn't open? Use the url below\r\n\x1b[2m${URL_LINE}\x1b[0m\r\nPaste code here if prompted >`)).toBe(URL_LINE)
  expect(setupTokenSignInUrl(`Use the url below\r\n${URL_LINE.slice(0, 80)}`)).toBeNull()
  expect(setupTokenSignInUrl('Opening browser to sign in…')).toBeNull()
})

test('only a code-shaped value is passed to the CLI', () => {
  expect(isSetupTokenCode('abcDEF123_-xyz#state_1234')).toBe(true)
  expect(isSetupTokenCode('abcDEF123_-xyz')).toBe(true)
  expect(isSetupTokenCode("abc'; rm -rf /")).toBe(false)
  expect(isSetupTokenCode('short')).toBe(false)
})

test('an error tail drops script’s banner and any line holding the secret', () => {
  const out = 'Paste code here if prompted > secret123#x\r\nOAuth error: invalid code\r\nScript done on now [COMMAND_EXIT_CODE="1"]\r\n'
  expect(setupTokenOutputTail(out, 2, 'secret123#x')).toBe('OAuth error: invalid code')
})

test('terminal text drops private-mode queries and stray control characters', () => {
  // Claude Code asks the terminal for its version (`ESC [>0q`) and shifts charsets (`\x0f`).
  expect(plainTerminalText('Paste code here if prompted > \x1b[>0q\x0f****\r\n')).toBe(
    'Paste code here if prompted > ****\n\n',
  )
})

/** Draws `next` over `previous` on the line above, as Claude Code does: unchanged cells are skipped. */
function redrawOver(previous: string, next: string) {
  let out = '\x1b[1A\r'
  for (let i = 0; i < next.length; i++) out += next[i] === previous[i] ? '\x1b[1C' : next[i]
  return `${out}\x1b[K\r\n`
}

test('a token drawn over the paste prompt is read whole from the screen', async () => {
  const prompt = 'Paste code here if prompted > ****'
  // Characters 13 and 14 match the prompt's "re", so Claude Code skips those cells.
  const token = `sk-ant-oat01-re${'Xy7_'.repeat(20)}`
  const transcript = `${prompt}\r\n${redrawOver(prompt, token)}Store this token securely.\r\n`
  // Stripping escape codes loses the skipped characters…
  expect(setupTokenFrom(transcript)).not.toBe(token)
  // …the screen keeps them.
  const screen = await terminalScreenText(transcript, 1000, 60)
  expect(setupTokenFrom(screen, true)).toBe(token)
})

test('while output is arriving, a token counts only once a later line is drawn', async () => {
  const token = `sk-ant-oat01-${'Ab9-'.repeat(20)}`
  expect(setupTokenFrom(await terminalScreenText(`Your token:\r\n${token.slice(0, 50)}`, 1000, 60), true)).toBeNull()
  expect(setupTokenFrom(await terminalScreenText(`Your token:\r\n${token}\r\n`, 1000, 60), true)).toBeNull()
  expect(
    setupTokenFrom(await terminalScreenText(`Your token:\r\n${token}\r\n\r\nStore this token securely.`, 1000, 60), true),
  ).toBe(token)
  // Once Claude Code has exited, the screen is final.
  expect(setupTokenFrom(await terminalScreenText(`Your token:\r\n${token}`, 1000, 60))).toBe(token)
})
