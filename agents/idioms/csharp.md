# C#/.NET Idioms

- Preserve namespace, project, nullable-reference-type, analyzer, and formatter conventions.
- Prefer explicit async/await and cancellation-token patterns where the surrounding code already uses them.
- Model data with existing records/classes and keep public API contracts stable.
- Use LINQ when it improves clarity, but avoid clever chains that obscure allocation or error behavior.
- Keep dependency injection, logging, and exception handling consistent with the local framework style.
