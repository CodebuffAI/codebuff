# Release launcher core

This directory is the canonical implementation of the npm launchers used by
Codebuff, Codecane, and Freebuff. Each product keeps a small `index.js` in its
release package that supplies product-specific configuration to
`createLauncher()`.

The npm packages must remain standalone, so their `prepack` scripts copy
`launcher.js` and `http.js` into the package directory. `postpack` removes those
generated, gitignored files again. No lifecycle scripts run when users install
or uninstall the packages.

When changing launcher behavior, edit this directory and test all package
assemblies with:

```bash
npm pack ./cli/release --dry-run
npm pack ./cli/release-staging --dry-run
npm pack ./freebuff/cli/release --dry-run
```
