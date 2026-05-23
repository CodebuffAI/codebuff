/**
 *
 * :::warning Experimental
 * `@auth/core` is under active development.
 * :::
 *
 * This is the main entry point to the Auth.js library.
 *
 * Based on the {@link https://developer.mozilla.org/en-US/docs/Web/API/Request Request}
 * and {@link https://developer.mozilla.org/en-US/docs/Web/API/Response Response} Web standard APIs.
 * Primarily used to implement [framework](https://authjs.dev/getting-started/integrations)-specific packages,
 * but it can also be used directly.
 *
 * ## Installation
 *
 * ```bash npm2yarn
 * npm install @auth/core
 * ```
 *
 * ## Usage
 *
 * ```ts
 * import { Auth } from "@auth/core"
 *
 * const request = new Request("https://example.com")
 * const response = await Auth(request, {...})
 *
 * console.log(response instanceof Response) // true
 * ```
 *
 * ## Resources
 *
 * - [Getting started](https://authjs.dev/getting-started)
 * - [Guides](https://authjs.dev/guides)
 *
 * @module @auth/core
 */
import { assertConfig } from "./lib/utils/assert.js";
import { AuthError, CredentialsSignin, ErrorPageLoop, isClientError, } from "./errors.js";
import { AuthInternal, raw, skipCSRFCheck } from "./lib/index.js";
import { setEnvDefaults, createActionURL } from "./lib/utils/env.js";
import renderPage from "./lib/pages/index.js";
import { setLogger } from "./lib/utils/logger.js";
import { toInternalRequest, toResponse } from "./lib/utils/web.js";
import { isAuthAction } from "./lib/utils/actions.js";
export { customFetch } from "./lib/symbols.js";
export { skipCSRFCheck, raw, setEnvDefaults, createActionURL, isAuthAction };
/**
 * Core functionality provided by Auth.js.
 *
 * Receives a standard {@link Request} and returns a {@link Response}.
 *
 * @example
 * ```ts
 * import { Auth } from "@auth/core"
 *
 * const request = new Request("https://example.com")
 * const response = await Auth(request, {
 *   providers: [Google],
 *   secret: "...",
 *   trustHost: true,
 * })
 *```
 * @see [Documentation](https://authjs.dev)
 */
export async function Auth(request, config) {
    const logger = setLogger(config);
    const internalRequest = await toInternalRequest(request, config);
    // There was an error parsing the request
    if (!internalRequest)
        return Response.json(`Bad request.`, { status: 400 });
    const warningsOrError = assertConfig(internalRequest, config);
    if (Array.isArray(warningsOrError)) {
        warningsOrError.forEach(logger.warn);
    }
    else if (warningsOrError) {
        // If there's an error in the user config, bail out early
        logger.error(warningsOrError);
        const htmlPages = new Set([
            "signin",
            "signout",
            "error",
            "verify-request",
        ]);
        if (!htmlPages.has(internalRequest.action) ||
            internalRequest.method !== "GET") {
            const message = "There was a problem with the server configuration. Check the server logs for more information.";
            return Response.json({ message }, { status: 500 });
        }
        const { pages, theme } = config;
        // If this is true, the config required auth on the error page
        // which could cause a redirect loop
        const authOnErrorPage = pages?.error &&
            internalRequest.url.searchParams
                .get("callbackUrl")
                ?.startsWith(pages.error);
        // Either there was no error page configured or the configured one contains infinite redirects
        if (!pages?.error || authOnErrorPage) {
            if (authOnErrorPage) {
                logger.error(new ErrorPageLoop(`The error page ${pages?.error} should not require authentication`));
            }
            const page = renderPage({ theme }).error("Configuration");
            return toResponse(page);
        }
        const url = `${internalRequest.url.origin}${pages.error}?error=Configuration`;
        return Response.redirect(url);
    }
    const isRedirect = request.headers?.has("X-Auth-Return-Redirect");
    const isRaw = config.raw === raw;
    try {
        const internalResponse = await AuthInternal(internalRequest, config);
        if (isRaw)
            return internalResponse;
        const response = toResponse(internalResponse);
        const url = response.headers.get("Location");
        if (!isRedirect || !url)
            return response;
        return Response.json({ url }, { headers: response.headers });
    }
    catch (e) {
        const error = e;
        logger.error(error);
        const isAuthError = error instanceof AuthError;
        if (isAuthError && isRaw && !isRedirect)
            throw error;
        // If the CSRF check failed for POST/session, return a 400 status code.
        // We should not redirect to a page as this is an API route
        if (request.method === "POST" && internalRequest.action === "session")
            return Response.json(null, { status: 400 });
        const isClientSafeErrorType = isClientError(error);
        const type = isClientSafeErrorType ? error.type : "Configuration";
        const params = new URLSearchParams({ error: type });
        if (error instanceof CredentialsSignin)
            params.set("code", error.code);
        const pageKind = (isAuthError && error.kind) || "error";
        const pagePath = config.pages?.[pageKind] ?? `${config.basePath}/${pageKind.toLowerCase()}`;
        const url = `${internalRequest.url.origin}${pagePath}?${params}`;
        if (isRedirect)
            return Response.json({ url });
        return Response.redirect(url);
    }
}
