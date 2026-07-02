/**
 * Typed accessor for the Electron preload bridge (see electron/preload.cjs).
 *
 * The renderer also runs in a plain browser (the Vite dev server, or the
 * orchestrator's packaged SPA opened in a tab), where the bridge is absent —
 * so `bridge()` returns `undefined` and every call site already guards with
 * optional chaining. Keeping the shape in one interface means a renamed preload
 * method becomes a type error instead of a silent `undefined` at runtime.
 */

/** Tab commands the native menu forwards to the renderer. */
export type MenuCommand = 'new-tab' | 'reopen-tab' | 'close-tab'

/** A pick returned by the native open dialog (the main process stats each one). */
export interface PickedAttachment {
  path: string
  name: string
  isDirectory: boolean
}

/** `process.platform` as seen across the bridge (e.g. 'darwin', 'win32', 'linux'). */
export type Platform = 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | (string & {})

/** The surface exposed on `window.freebuffDesktop` by the preload. */
export interface FreebuffDesktopBridge {
  platform: Platform
  versions: { electron: string; chrome: string; node: string }
  /** Subscribe to native menu → tab commands; returns an unsubscribe fn. */
  onMenuCommand: (handler: (name: MenuCommand) => void) => () => void
  /** Resolve a dropped/pasted File to its absolute path ('' for non-file blobs). */
  getPathForFile: (file: File) => string
  /** Native open dialog (files AND folders, multi-select). */
  pickAttachments: () => Promise<PickedAttachment[]>
  /** Native folder chooser for opening a project; resolves to the chosen
   *  absolute path, or null when the user cancels. */
  pickDirectory: () => Promise<string | null>
  /** Write pasted image bytes to a temp file so they attach like any other file. */
  saveClipboardImage: (
    bytes: Uint8Array,
    ext: string,
  ) => Promise<{ path: string; name: string } | null>
  /** Bring up the system terminal (recovery flows, e.g. `claude /login`).
   *  mac-only today; resolves false where unsupported. Optional so an older
   *  packaged preload doesn't break a newer renderer. */
  openTerminal?: () => Promise<boolean>
}

declare global {
  interface Window {
    freebuffDesktop?: FreebuffDesktopBridge
  }
}

/** The Electron preload bridge, or `undefined` in a plain browser. */
export function bridge(): FreebuffDesktopBridge | undefined {
  return window.freebuffDesktop
}
