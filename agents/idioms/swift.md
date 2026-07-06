# Swift Idioms

- Prefer value semantics, optionals, protocols, extensions, and standard-library collections in the local style.
- Use `guard`, `defer`, and early exits to keep control flow clear where appropriate.
- Preserve Swift Package, Xcode, SwiftUI/UIKit, formatter, and concurrency conventions already present.
- Keep async/await, actors, and MainActor boundaries explicit in UI or shared-state code.
- Avoid force unwraps and force casts unless invariants are already proven and documented nearby.
