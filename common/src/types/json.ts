import z from 'zod/v4'

export type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONObject
  | JSONArray
export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    JSONObjectSchema,
    JSONArraySchema,
  ]),
)

export const JSONObjectSchema: z.ZodType<JSONObject> = z.lazy(() =>
  z.record(z.string(), jsonValueSchema),
)
export type JSONObject = { [key: string]: JSONValue }

export const JSONArraySchema: z.ZodType<JSONArray> = z.lazy(() =>
  z.array(jsonValueSchema),
)
export type JSONArray = JSONValue[]
