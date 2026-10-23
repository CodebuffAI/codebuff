/** Immutable, token-free handoff. The Desktop host fetches only from Freebuff. */
import { z } from 'zod/v4'

export const labDesktopTestRefSchema = z
  .object({
    skillId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/)
      .max(80),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
export type LabDesktopTestRef = z.infer<typeof labDesktopTestRefSchema>

export function labDesktopTestUrl(ref: LabDesktopTestRef): string {
  const parsed = labDesktopTestRefSchema.parse({
    skillId: ref.skillId,
    version: ref.version,
    sha256: ref.sha256,
  })
  return `freebuff://agentic-lab?${new URLSearchParams(parsed)}`
}

export function parseLabDesktopTestUrl(
  value: string,
): LabDesktopTestRef | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'freebuff:' ||
      url.hostname !== 'agentic-lab' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.hash ||
      url.username ||
      url.password ||
      url.port ||
      [...url.searchParams.keys()].length !== 3
    )
      return null
    const result = labDesktopTestRefSchema.safeParse(
      Object.fromEntries(url.searchParams),
    )
    return result.success ? result.data : null
  } catch {
    return null
  }
}
