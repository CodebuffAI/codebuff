// Original from DefinitelyTyped. Thanks a million
// Type definitions for comment-json 1.1
// Project: https://github.com/kaelzhang/node-comment-json
// Definitions by: Jason Dent <https://github.com/Jason3S>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare const commentSymbol: unique symbol

// Define comment prefix constants first to avoid magic strings
declare const PREFIX_BEFORE: 'before'
declare const PREFIX_AFTER_PROP: 'after-prop'
declare const PREFIX_AFTER_COLON: 'after-colon'
declare const PREFIX_AFTER_VALUE: 'after-value'
declare const PREFIX_AFTER: 'after'
declare const PREFIX_BEFORE_ALL: 'before-all'
declare const PREFIX_AFTER_ALL: 'after-all'

// Export the constants
export {
  PREFIX_BEFORE,
  PREFIX_AFTER_PROP,
  PREFIX_AFTER_COLON,
  PREFIX_AFTER_VALUE,
  PREFIX_AFTER,
  PREFIX_BEFORE_ALL,
  PREFIX_AFTER_ALL
}

// Use the constant types to build CommentPrefix
export type PropertyCommentPrefix = typeof PREFIX_BEFORE
  | typeof PREFIX_AFTER_PROP
  | typeof PREFIX_AFTER_COLON
  | typeof PREFIX_AFTER_VALUE
  | typeof PREFIX_AFTER

export type NonPropertyCommentPrefix = typeof PREFIX_BEFORE
  | typeof PREFIX_AFTER
  | typeof PREFIX_BEFORE_ALL
  | typeof PREFIX_AFTER_ALL

export type CommentPrefix = PropertyCommentPrefix | NonPropertyCommentPrefix

export type CommentDescriptor = `${PropertyCommentPrefix}:${string}`
  | NonPropertyCommentPrefix

export type CommentSymbol = typeof commentSymbol

export class CommentArray<TValue> extends Array<TValue> {
  [commentSymbol]: CommentToken[]
}

export type CommentJSONValue = number
  | string
  | null
  | boolean
  | CommentArray<CommentJSONValue>
  | CommentObject

export interface CommentObject {
  [key: string]: CommentJSONValue
  [commentSymbol]: CommentToken[]
}

export interface CommentToken {
  type: 'BlockComment' | 'LineComment'
  /** The content of the comment, including whitespaces and line breaks */
  value: string
  /**
   * If the start location is the same line as the previous token,
   * then `inline` is `true`
   */
  inline: boolean
  /* But pay attention that, locations will NOT be maintained when stringified */
  loc: CommentLocation
}

export interface CommentLocation {
  /** The start location begins at the `//` or `/*` symbol */
  start: Location
  // The end location of multi-line comment ends at the `*/` symbol
  end: Location
}

export interface Location {
  line: number
  column: number
}

export type Reviver = (
  k: number | string,
  v: unknown,
  context?: { source?: string }
) => unknown

/**
 * Converts a JavaScript Object Notation (JSON) string into an object.
 * @param json A valid JSON string.
 * @param reviver A function that transforms the results. This function is called for each member of the object.
 * @param removesComments If true, the comments won't be maintained, which is often used when we want to get a clean object.
 * If a member contains nested objects, the nested objects are transformed before the parent object is.
 */
export function parse(
  json: string,
  reviver?: Reviver | null,
  removesComments?: boolean
): CommentJSONValue

/**
 * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
 * @param value A JavaScript value, usually an object or array, to be converted.
 * @param replacer A function that transforms the results or an array of strings and numbers that acts as a approved list for selecting the object properties that will be stringified.
 * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
 */
export function stringify(
  value: unknown,
  replacer?: (
    (key: string, value: unknown) => unknown
  ) | Array<number | string> | null,
  space?: string | number
): string


export function tokenize(input: string, config?: TokenizeOptions): Token[]

export interface Token {
  type: string
  value: string
}

export interface TokenizeOptions {
  tolerant?: boolean
  range?: boolean
  loc?: boolean
  comment?: boolean
}

/**
 * Assign properties and comments from source to target
 * @param target The target object to assign to
 * @param source The source object to assign from
 * @param keys Optional array of keys to assign. If not provided, all keys and non-property comments are assigned
 * @returns The target object
 */
export function assign<TTarget, TSource>(
  target: TTarget,
  source: TSource,
  // Although it actually accepts more key types and filters then,
  // we set the type of `keys` stricter
  keys?: readonly (number | string)[]
): TTarget

interface CommentPosition {
  where: CommentPrefix
  key?: string
}

/**
 * Move comments from one location to another
 * @param source The source object containing comments
 * @param target The target object to move comments to (defaults to source if not provided)
 * @param from The source comment location
 * @param to The target comment location
 * @param override Whether to override existing comments at the target location
 */
export function moveComments(
  source: CommentJSONValue,
  target: CommentJSONValue | undefined,
  from: CommentPosition,
  to: CommentPosition,
  override?: boolean
): void

/**
 * Remove comments from a specific location
 * @param target The target object to remove comments from
 * @param location The comment location to remove
 */
export function removeComments(
  target: CommentJSONValue,
  location: CommentPosition
): void

