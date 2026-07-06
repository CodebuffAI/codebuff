# Go Idioms

- Keep functions small and explicit; handle errors immediately and return early when it improves clarity.
- Prefer simple interfaces at the consumer boundary and avoid over-abstracting concrete behavior.
- Preserve package organization, exported-name comments, gofmt/go vet expectations, and table-test style.
- Pass context through call chains that already use it; do not store contexts in structs.
- Use zero values and standard-library primitives idiomatically before adding custom machinery.
