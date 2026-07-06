# C/C++ Idioms

- Respect ownership, lifetime, ABI, and the project-selected language standard before changing APIs.
- Prefer RAII, const-correctness, value semantics, and standard-library facilities where they fit local style.
- Avoid raw owning pointers and manual resource management unless the surrounding code requires them.
- Keep header/source boundaries, include order, namespaces, and build-system expectations intact.
- Make error handling, threading, and allocation behavior explicit in performance-sensitive paths.
