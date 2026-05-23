/**
 *
 * This module contains public types and interfaces of the core package.
 *
 * ## Installation
 *
 * ```bash npm2yarn
 * npm install @auth/core
 * ```
 *
 * You can then import this submodule from `@auth/core/types`.
 *
 * ## Usage
 *
 * Even if you don't use TypeScript, IDEs like VS Code will pick up types to provide you with a better developer experience.
 * While you are typing, you will get suggestions about what certain objects/functions look like,
 * and sometimes links to documentation, examples, and other valuable resources.
 *
 * Generally, you will not need to import types from this module.
 * Mostly when using the `Auth` function and optionally the `AuthConfig` interface,
 * everything inside there will already be typed.
 *
 * :::tip
 * Inside the `Auth` function, you won't need to use a single type from this module.
 *
 * @example
 * ```ts title=index.ts
 * import { Auth } from "@auth/core"
 *
 * const request = new Request("https://example.com")
 * const response = await Auth(request, {
 *   callbacks: {
 *     jwt(): JWT { // <-- This is unnecessary!
 *       return { foo: "bar" }
 *     },
 *     session(
 *        { session, token }: { session: Session; token: JWT } // <-- This is unnecessary!
 *     ) {
 *       return session
 *     },
 *   }
 * })
 * ```
 * :::
 *
 * ## Resources
 *
 * - [TypeScript - The Basics](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)
 * - [Extending built-in types](https://authjs.dev/getting-started/typescript#module-augmentation)
 *
 * @module types
 */
export {};
