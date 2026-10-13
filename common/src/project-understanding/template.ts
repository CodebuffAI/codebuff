/**
 * The project-understanding template: the sections the project-understanding agent fills in
 * about the project a session is working in (docs/freebuff-project-understanding.md).
 *
 * The backend owns the template and serves it with the "is a run due"
 * answer, so a section can be added or reworded with a web deploy and no
 * client release. A client only knows the shape below: sections of typed
 * fields. It builds the agent's output schema from whatever template it was
 * given, and the server checks the answer against the version it served.
 *
 * Every field may be left unknown (stored as `null`). The project-understanding agent fills in what it found
 * evidence for and nothing else, so "unknown" is a real answer, not a failure.
 */
import z from 'zod/v4'

import type { JsonObjectSchema, JsonSchema } from '../templates/initial-agents-dir/types/util-types'

/**
 * The stored profile's counted section: file count, lines of code and the
 * language mix, filled in from the client's stats (`stats.ts`), never by the
 * model. Reserved, so no template section can take this key.
 */
export const PROJECT_UNDERSTANDING_SIZE_SECTION = 'size'

/** Longest value a free-text field keeps. Names, not sentences. */
export const PROJECT_UNDERSTANDING_MAX_VALUE_LENGTH = 80

/** Most values a list field keeps. */
export const PROJECT_UNDERSTANDING_MAX_LIST_LENGTH = 30

/** How long a stored profile stays fresh. Past it (or when the backend's
 *  template is newer than the one the profile answered), the next session
 *  runs over the project again. */
export const PROJECT_UNDERSTANDING_REPORT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

const keySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,47}$/, 'keys are snake_case')

const optionSchema = z.string().min(1).max(PROJECT_UNDERSTANDING_MAX_VALUE_LENGTH)

/**
 * - `choice`: one of `options`.
 * - `choices`: any of `options`. With `allowOther`, a name outside them is kept
 *   as written.
 * - `names`: a list of short names (frameworks, test runners).
 * - `boolean`: yes or no.
 */
export const projectUnderstandingFieldSchema = z.discriminatedUnion('kind', [
  z.object({
    key: keySchema,
    kind: z.literal('choice'),
    label: z.string().min(1).max(120),
    guidance: z.string().max(600).optional(),
    options: z.array(optionSchema).min(1).max(60),
  }),
  z.object({
    key: keySchema,
    kind: z.literal('choices'),
    label: z.string().min(1).max(120),
    guidance: z.string().max(600).optional(),
    options: z.array(optionSchema).min(1).max(60),
    allowOther: z.boolean().optional(),
  }),
  z.object({
    key: keySchema,
    kind: z.literal('names'),
    label: z.string().min(1).max(120),
    guidance: z.string().max(600).optional(),
  }),
  z.object({
    key: keySchema,
    kind: z.literal('boolean'),
    label: z.string().min(1).max(120),
    guidance: z.string().max(600).optional(),
  }),
])

export type ProjectUnderstandingField = z.infer<typeof projectUnderstandingFieldSchema>

export const projectUnderstandingSectionSchema = z.object({
  key: keySchema,
  title: z.string().min(1).max(120),
  guidance: z.string().max(600).optional(),
  fields: z.array(projectUnderstandingFieldSchema).min(1).max(20),
})

export type ProjectUnderstandingSection = z.infer<
  typeof projectUnderstandingSectionSchema
>

export const projectUnderstandingTemplateSchema = z
  .object({
    version: z.number().int().positive(),
    sections: z.array(projectUnderstandingSectionSchema).min(1).max(20),
  })
  .superRefine((template, ctx) => {
    const sections = new Set<string>()
    for (const section of template.sections) {
      if (section.key === PROJECT_UNDERSTANDING_SIZE_SECTION) {
        ctx.addIssue({
          code: 'custom',
          message: `section key ${PROJECT_UNDERSTANDING_SIZE_SECTION} is reserved for the counted section`,
        })
      }
      if (sections.has(section.key)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate section ${section.key}`,
        })
      }
      sections.add(section.key)
      const fields = new Set<string>()
      for (const field of section.fields) {
        if (fields.has(field.key)) {
          ctx.addIssue({
            code: 'custom',
            message: `duplicate field ${section.key}.${field.key}`,
          })
        }
        fields.add(field.key)
      }
    }
  })

export type ProjectUnderstandingTemplate = z.infer<
  typeof projectUnderstandingTemplateSchema
>

/** What the project-understanding agent answers for a single-value field it has no evidence for.
 *  Stored as `null`. */
const UNKNOWN = 'unknown'

/** A field's stored value; `null` is unknown. */
export type ProjectUnderstandingValue = string | string[] | boolean | null

/** `{ [sectionKey]: { [fieldKey]: value } }`, every template field present. */
export type ProjectUnderstanding = Record<
  string,
  Record<string, ProjectUnderstandingValue>
>

function fieldJsonSchema(field: ProjectUnderstandingField): JsonSchema {
  const description = field.guidance
    ? `${field.label}. ${field.guidance}`
    : field.label
  switch (field.kind) {
    case 'choice':
      return {
        type: 'string',
        enum: [...field.options, UNKNOWN],
        description: `${description} "${UNKNOWN}" when there is no evidence.`,
      }
    case 'choices':
      return {
        type: 'array',
        items: field.allowOther
          ? { type: 'string' }
          : { type: 'string', enum: field.options },
        description: field.allowOther
          ? `${description} Use these names where they fit: ${field.options.join(', ')}. Any other name as written. [] when none were found.`
          : `${description} [] when none were found.`,
      }
    case 'names':
      return {
        type: 'array',
        items: { type: 'string' },
        description: `${description} [] when none were found.`,
      }
    case 'boolean':
      return {
        type: 'string',
        enum: ['yes', 'no', UNKNOWN],
        description: `${description} "${UNKNOWN}" when there is no evidence.`,
      }
  }
}

/** The JSON schema the project-understanding agent's `set_output` call must satisfy. */
export function buildProjectUnderstandingOutputSchema(
  template: ProjectUnderstandingTemplate,
): JsonObjectSchema {
  const properties: Record<string, JsonSchema> = {}
  for (const section of template.sections) {
    const fields: Record<string, JsonSchema> = {}
    for (const field of section.fields) fields[field.key] = fieldJsonSchema(field)
    properties[section.key] = {
      type: 'object',
      description: section.guidance
        ? `${section.title}. ${section.guidance}`
        : section.title,
      properties: fields,
      required: section.fields.map((field) => field.key),
    }
  }
  return {
    type: 'object',
    properties,
    required: template.sections.map((section) => section.key),
  }
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.slice(0, PROJECT_UNDERSTANDING_MAX_VALUE_LENGTH)
}

function matchOption(options: readonly string[], value: string): string | null {
  const lower = value.toLowerCase()
  return options.find((option) => option.toLowerCase() === lower) ?? null
}

function cleanList(values: unknown, map: (value: string) => string | null) {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const name = cleanName(raw)
    const value =
      name === null || name.toLowerCase() === UNKNOWN ? null : map(name)
    if (value === null || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    out.push(value)
    if (out.length >= PROJECT_UNDERSTANDING_MAX_LIST_LENGTH) break
  }
  return out
}

function normalizeField(
  field: ProjectUnderstandingField,
  raw: unknown,
): ProjectUnderstandingValue {
  switch (field.kind) {
    case 'choice': {
      const name = cleanName(raw)
      return name === null ? null : matchOption(field.options, name)
    }
    case 'choices':
      return cleanList(raw, (name) =>
        matchOption(field.options, name) ?? (field.allowOther ? name : null),
      )
    case 'names':
      return cleanList(raw, (name) => name)
    case 'boolean':
      if (typeof raw === 'boolean') return raw
      if (raw === 'yes') return true
      if (raw === 'no') return false
      return null
  }
}

/**
 * The profile as the template allows it: every template field present, values
 * outside a field's options dropped (or matched case-insensitively), lists
 * deduplicated and capped, keys the template does not name dropped. Never
 * throws: an answer that is not an object normalizes to all-unknown.
 *
 * The client runs this before reporting and the server runs it again on what
 * arrives, so what is stored never depends on the client having done so.
 */
export function normalizeProjectUnderstanding(
  template: ProjectUnderstandingTemplate,
  raw: unknown,
): ProjectUnderstanding {
  const answer =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const profile: ProjectUnderstanding = {}
  for (const section of template.sections) {
    const rawSection = answer[section.key]
    const sectionAnswer =
      rawSection && typeof rawSection === 'object' && !Array.isArray(rawSection)
        ? (rawSection as Record<string, unknown>)
        : {}
    const values: Record<string, ProjectUnderstandingValue> = {}
    for (const field of section.fields) {
      values[field.key] = normalizeField(field, sectionAnswer[field.key])
    }
    profile[section.key] = values
  }
  return profile
}

/** Whether the profile says anything at all, so an all-unknown answer (the
 *  model gave up) is not stored as if it were a finding. */
export function projectUnderstandingHasFindings(profile: ProjectUnderstanding): boolean {
  return Object.values(profile).some((section) =>
    Object.values(section).some((value) =>
      Array.isArray(value) ? value.length > 0 : value !== null,
    ),
  )
}
