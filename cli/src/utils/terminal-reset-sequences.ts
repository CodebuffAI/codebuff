/**
 * Terminal escape sequences to reset terminal state.
 * Shared by the in-process cleanup handlers (renderer-cleanup.ts) and the
 * sacrificial watchdog process (terminal-watchdog.ts).
 *
 * Keep this list in sync with the modes OpenTUI enables (see the enable
 * sequences in @opentui/core's native lib) and with
 * SAFE_TERMINAL_RESET_SEQUENCES in the npm wrapper release scripts
 * (cli/release/index.js, cli/release-staging/index.js,
 * freebuff/cli/release/index.js).
 *
 * Sequences:
 * - \x1b[?1049l: Exit alternate screen buffer (restores main screen)
 * - \x1b[?1000l: Disable X10 mouse mode
 * - \x1b[?1002l: Disable button event mouse mode
 * - \x1b[?1003l: Disable any-event mouse mode (all motion tracking)
 * - \x1b[?1006l: Disable SGR extended mouse mode
 * - \x1b[?1004l: Disable focus reporting
 * - \x1b[?2004l: Disable bracketed paste mode
 * - \x1b[<u:     Pop the kitty keyboard protocol flags OpenTUI pushes
 * - \x1b[>4;0m:  Reset xterm modifyOtherKeys (OpenTUI sets [>4;1m)
 * - \x1b[?25h:   Show cursor (safety measure)
 */
export const TERMINAL_RESET_SEQUENCES =
  '\x1b[?1049l' + // Exit alternate screen buffer
  '\x1b[?1000l' + // Disable X10 mouse mode
  '\x1b[?1002l' + // Disable button event mouse mode
  '\x1b[?1003l' + // Disable any-event mouse mode (all motion)
  '\x1b[?1006l' + // Disable SGR extended mouse mode
  '\x1b[?1004l' + // Disable focus reporting
  '\x1b[?2004l' + // Disable bracketed paste mode
  '\x1b[<u' + // Pop kitty keyboard protocol flags
  '\x1b[>4;0m' + // Reset modifyOtherKeys
  '\x1b[?25h' // Show cursor
