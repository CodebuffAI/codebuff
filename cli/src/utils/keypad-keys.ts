type KeypadKey = {
  name?: string
  sequence?: string
}

const APPLICATION_KEYPAD_DIGITS = 'pqrstuvwxy'
const KEYPAD_OPERATOR_NAMES: Record<string, string> = {
  kpdecimal: '.',
  kpdivide: '/',
  kpmultiply: '*',
  kpminus: '-',
  kpplus: '+',
  kpequal: '=',
  kpseparator: ',',
}

const APPLICATION_KEYPAD_OPERATORS: Record<string, string> = {
  n: '.',
  o: '/',
  j: '*',
  m: '-',
  k: '+',
  X: '=',
  l: ',',
}

export function isKeypadEnter(key: KeypadKey): boolean {
  return key.name === 'kpenter' || key.sequence === '\x1bOM'
}

export function getKeypadPrintableSequence(key: KeypadKey): string | null {
  const kittyDigit = /^kp([0-9])$/.exec(key.name ?? '')?.[1]
  if (kittyDigit !== undefined) return kittyDigit

  const kittyOperator = key.name ? KEYPAD_OPERATOR_NAMES[key.name] : undefined
  if (kittyOperator !== undefined) return kittyOperator

  if (!key.sequence?.startsWith('\x1bO') || key.sequence.length !== 3) {
    return null
  }

  const applicationKey = key.sequence[2] ?? ''
  const applicationDigit = APPLICATION_KEYPAD_DIGITS.indexOf(applicationKey)
  if (applicationDigit >= 0) return String(applicationDigit)

  return APPLICATION_KEYPAD_OPERATORS[applicationKey] ?? null
}
