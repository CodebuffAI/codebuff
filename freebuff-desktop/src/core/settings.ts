/**
 * Project settings — the file-backed, user-editable companion to {@link RunConfig}
 * (which still lives in SQLite for now). Edited by the Settings modal and
 * version-controlled alongside the project, like the matching `.freebuff/docs/`
 * and `.freebuff/skills/` directories.
 *
 * The file is **optional**: an absent file falls back to {@link DEFAULT_SETTINGS},
 * so out-of-the-box behavior matches what we shipped before this store existed.
 *
 * v1 schema is deliberately narrow: `preview.entry` is the single knob. Future
 * sections (build/test commands, dev-server mode for Preview) slot in as new
 * top-level keys without a breaking change to existing files. When the schema
 * needs to break, bump `SETTINGS_SCHEMA_VERSION` and add a migration in
 * {@link SettingsStore.migrate}.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join } from 'path'

/** Bump when schema changes incompatibly; `migrate()` is the safety net. */
export const SETTINGS_SCHEMA_VERSION = 1

/** The single knob v1 ships with. Everything else stays in defaults. */
export interface PreviewSettings {
  /**
   * Path (relative to the project root or thread worktree) the in-app Preview
   * iframe should serve. Default `"index.html"`. Must be relative and free of
   * `..` segments — the static preview server traversal-guards it anyway, but
   * we reject bad input on write for a clearer error.
   */
  entry?: string
}

export interface ProjectSettings {
  version: number
  preview: PreviewSettings
}

/** What read() returns when no settings file exists (yet). */
export const DEFAULT_SETTINGS: ProjectSettings = {
  version: SETTINGS_SCHEMA_VERSION,
  preview: { entry: 'index.html' },
}

/** Settings whose values couldn't be safely defaulted (validation errors). */
export interface SettingsValidationError {
  field: string
  message: string
}

export class SettingsStore {
  private readonly path: string

  constructor(opts: { repoRoot: string }) {
    this.path = join(opts.repoRoot, '.freebuff', 'settings.json')
  }

  /** Absolute path of the on-disk file (handy for the Settings UI). */
  filePath(): string {
    return this.path
  }

  exists(): boolean {
    return existsSync(this.path)
  }

  /**
   * Read the user's settings, falling back to {@link DEFAULT_SETTINGS} when
   * the file is missing. Surface per-field validation errors without throwing
   * — the Settings UI shows them inline, and downstream code can keep going
   * against the fallback values.
   */
  read(): { settings: ProjectSettings; errors: SettingsValidationError[] } {
    if (!this.exists()) return { settings: DEFAULT_SETTINGS, errors: [] }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.path, 'utf8'))
    } catch {
      return {
        settings: DEFAULT_SETTINGS,
        errors: [{ field: '', message: 'Settings file is not valid JSON' }],
      }
    }

    return this.migrateAndValidate(parsed)
  }

  /**
   * Write settings atomically (write-to-tmp + rename). Round-trips against
   * {@link read} so the UI can save-then-display without re-reading. Validates
   * before writing; throws on invalid input so the API can surface it.
   */
  write(next: ProjectSettings): void {
    const { errors } = this.validate(next)
    const fatal = errors.filter((e) => e.field === 'preview.entry')
    if (fatal.length > 0) {
      throw new Error(fatal.map((e) => e.message).join('; '))
    }
    const tmp = `${this.path}.tmp`
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    renameSync(tmp, this.path)
  }

  // — internals —

  /** Coerce an unknown object into a validated ProjectSettings (or the default). */
  private migrateAndValidate(
    raw: unknown,
  ): { settings: ProjectSettings; errors: SettingsValidationError[] } {
    if (!raw || typeof raw !== 'object') {
      return {
        settings: DEFAULT_SETTINGS,
        errors: [{ field: '', message: 'Settings must be a JSON object' }],
      }
    }
    const obj = raw as Record<string, unknown>
    const migrated: ProjectSettings = this.migrate(obj)
    const { errors } = this.validate(migrated)
    return { settings: migrated, errors }
  }

  /**
   * Forward-compatible migration: when the file's `version` is older than
   * {@link SETTINGS_SCHEMA_VERSION}, layer defaults atop it instead of
   * rejecting — the user shouldn't lose settings by upgrading the app.
   */
  private migrate(obj: Record<string, unknown>): ProjectSettings {
    const fileVersion =
      typeof obj.version === 'number' ? obj.version : SETTINGS_SCHEMA_VERSION
    if (fileVersion === SETTINGS_SCHEMA_VERSION) {
      return {
        version: SETTINGS_SCHEMA_VERSION,
        preview: { ...DEFAULT_SETTINGS.preview, ...(obj.preview as object ?? {}) },
      }
    }
    // Unknown future version or older version we don't know how to migrate:
    // start clean so we never silently apply incompatible fields.
    return { ...DEFAULT_SETTINGS, version: SETTINGS_SCHEMA_VERSION }
  }

  /** Per-field checks. Non-fatal errors are surfaced to the UI; fatal ones
   *  block write. Today `preview.entry` validation is the only fatal case. */
  private validate(s: ProjectSettings): { errors: SettingsValidationError[] } {
    const errors: SettingsValidationError[] = []
    const entry = s.preview?.entry
    if (entry !== undefined) {
      if (typeof entry !== 'string' || entry.length === 0) {
        errors.push({ field: 'preview.entry', message: 'Preview entry must be a non-empty path' })
      } else if (isAbsolute(entry)) {
        errors.push({ field: 'preview.entry', message: 'Preview entry must be a relative path' })
      } else if (entry.split(/[/\\]/).includes('..')) {
        errors.push({ field: 'preview.entry', message: 'Preview entry cannot contain ".."' })
      }
    }
    return { errors }
  }
}
