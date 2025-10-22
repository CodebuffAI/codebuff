# npm-app Knowledge

- npm distribution scripts (e.g. `release` artifacts in `npm-app/release*`) still rely on Node-based uninstall helpers for compatibility with end users. The development workflows now require Bun 1.3.0+, so keep the legacy Node snippets only in the published package files.
