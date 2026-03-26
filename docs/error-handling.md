# Error Handling

Prefer `ErrorOr<T>` return values (`success(...)`/`failure(...)` in `common/src/util/error.ts`) over throwing.

See [Error Schema](./error-schema.md) for the full server error response format and client-side handling.
