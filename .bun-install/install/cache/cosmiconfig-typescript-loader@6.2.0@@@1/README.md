# cosmiconfig-typescript-loader

> ⚙️🚀 TypeScript config file support for cosmiconfig

[![build](https://github.com/Codex-/cosmiconfig-typescript-loader/actions/workflows/build.yml/badge.svg)](https://github.com/Codex-/cosmiconfig-typescript-loader/actions/workflows/build.yml)
[![codecov](https://codecov.io/gh/Codex-/cosmiconfig-typescript-loader/branch/main/graph/badge.svg?token=WWGNIPC249)](https://codecov.io/gh/Codex-/cosmiconfig-typescript-loader)
[![npm](https://img.shields.io/npm/v/cosmiconfig-typescript-loader.svg)](https://www.npmjs.com/package/cosmiconfig-typescript-loader)

## Usage

Simply add `TypeScriptLoader` to the list of loaders for the `.ts` file type, and `await` loading:

```ts
import { cosmiconfig } from "cosmiconfig";
import { TypeScriptLoader } from "cosmiconfig-typescript-loader";

const moduleName = "module";
const explorer = cosmiconfig("test", {
  searchPlaces: [
    "package.json",
    `.${moduleName}rc`,
    `.${moduleName}rc.json`,
    `.${moduleName}rc.yaml`,
    `.${moduleName}rc.yml`,
    `.${moduleName}rc.js`,
    `.${moduleName}rc.ts`,
    `.${moduleName}rc.cjs`,
    `${moduleName}.config.js`,
    `${moduleName}.config.ts`,
    `${moduleName}.config.cjs`,
  ],
  loaders: {
    ".ts": TypeScriptLoader(),
  },
});

const cfg = await explorer.load("./");
```

Or more simply if you only support loading of a TypeScript based configuration file:

```ts
import { cosmiconfig } from "cosmiconfig";
import { TypeScriptLoader } from "cosmiconfig-typescript-loader";

const moduleName = "module";
const explorer = cosmiconfig("test", {
  loaders: {
    ".ts": TypeScriptLoader(),
  },
});

const cfg = await explorer.load("./amazing.config.ts");
```

### Synchronously loading

With the release of Jiti 2, the synchronous loader has now been deprecated. It can still be used by using the `TypeScriptLoaderSync` export:

```ts
import { cosmiconfig } from "cosmiconfig";
import { TypeScriptLoaderSync } from "cosmiconfig-typescript-loader";

const moduleName = "module";
const explorer = cosmiconfig("test", {
  loaders: {
    ".ts": TypeScriptLoaderSync(),
  },
});

const cfg = explorer.load("./amazing.config.ts");
```

## `@endemolshinegroup/cosmiconfig-typescript-loader`

This package serves as a drop in replacement for `@endemolshinegroup/cosmiconfig-typescript-loader`. At the time of publishing this, `endemolshinegroup` is not maintaining the original package. I can only assume this is to do with the fact that Endemol Shine Group [was purchased and absorbed by another business](https://en.wikipedia.org/wiki/Endemol_Shine_Group#Sale_to_Banijay). This discontinuation of development efforts towards the original package left any open issues and pull requests unresolved.

This new package resolves the following original issues:

- [`#134`](https://github.com/EndemolShineGroup/cosmiconfig-typescript-loader/issues/134): "Doesn't work with Cosmiconfig sync API"
- [`#147`](https://github.com/EndemolShineGroup/cosmiconfig-typescript-loader/issues/147): "doesn't provide typescript, requested by ts-node"
- [`#155`](https://github.com/EndemolShineGroup/cosmiconfig-typescript-loader/issues/155): "Misleading TypeScriptCompileError when user's tsconfig.json "module" is set to "es2015""
