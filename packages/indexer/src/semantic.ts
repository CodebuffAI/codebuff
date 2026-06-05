// Semantic (embedding-based) indexing — not yet implemented.
// This module is a placeholder for future provider-backed semantic search.
// Configure via openbuff.json:
//   { "indexing": { "semantic": { "enabled": true, "model": "openai/text-embedding-3-small" } } }

export function isSemanticIndexingAvailable(): boolean {
  return false
}

// TODO: implement provider-backed embedding generation and cosine similarity search
