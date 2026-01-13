/**
 * Shared error helper utilities for tests.
 * These provide typed ways to create errors with additional properties
 * like `code` (for Node.js filesystem errors) and `constraint` (for Postgres errors).
 */

export interface NodeError extends Error {
  code?: string
}

export interface PostgresError extends Error {
  code: string
  constraint?: string
}

export const createNodeError = (message: string, code: string): NodeError => {
  const error: NodeError = new Error(message)
  error.code = code
  return error
}

export const createPostgresError = (
  message: string,
  code: string,
  constraint?: string,
): PostgresError => {
  const error = new Error(message) as PostgresError
  error.code = code
  if (constraint !== undefined) {
    error.constraint = constraint
  }
  return error
}
