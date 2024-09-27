export const STOP_MARKER = '[' + 'END]'
export const FIND_FILES_MARKER = '[' + 'FIND_FILES_PLEASE]'
export const TOOL_RESULT_MARKER = '[' + 'TOOL_RESULT]'

export const SKIPPED_TERMINAL_COMMANDS = [
  'continue',
  'date',
  'head',
  'history',
  'if',
  'jobs',
  'less',
  'man',
  'more',
  'nice',
  'read',
  'set',
  'sort',
  'split',
  'tail',
  'test',
  'time',
  'top',
  'touch',
  'type',
  'unset',
  'what',
  'which',
  'who',
  'write',
  'yes',
  'help',
  'find',
  'kill',
]

export const MAX_DATE = new Date(86399999999999)

export const TOKEN_USAGE_LIMITS = {
  ANON: 1_000_000,
  FREE: 5_000_000,
  PAID: 10_000_000,
}
