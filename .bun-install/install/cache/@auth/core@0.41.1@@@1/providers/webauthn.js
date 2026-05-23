import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, } from "@simplewebauthn/server";
import { MissingAdapter } from "../errors.js";
export const DEFAULT_WEBAUTHN_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_SIMPLEWEBAUTHN_BROWSER_VERSION = "v9.0.1";
/**
 * Add WebAuthn login to your page.
 *
 * ### Setup
 *
 * #### Configuration
 * ```ts
 * import { Auth } from "@auth/core"
 * import WebAuthn from "@auth/core/providers/webauthn"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [WebAuthn],
 * })
 * ```
 * ### Resources
 *
 * - [SimpleWebAuthn - Server side](https://simplewebauthn.dev/docs/packages/server)
 * - [SimpleWebAuthn - Client side](https://simplewebauthn.dev/docs/packages/client)
 * - [Source code](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/webauthn.ts)
 *
 * :::tip
 *
 * The WebAuthn provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/webauthn.ts).
 * To override the defaults for your use case, check out [customizing the built-in WebAuthn provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * :::
 *
 * :::info **Disclaimer**
 *
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 *
 * :::
 */
export default function WebAuthn(config) {
    return {
        id: "webauthn",
        name: "WebAuthn",
        enableConditionalUI: true,
        simpleWebAuthn: {
            generateAuthenticationOptions,
            generateRegistrationOptions,
            verifyAuthenticationResponse,
            verifyRegistrationResponse,
        },
        authenticationOptions: { timeout: DEFAULT_WEBAUTHN_TIMEOUT },
        registrationOptions: { timeout: DEFAULT_WEBAUTHN_TIMEOUT },
        formFields: {
            email: {
                label: "Email",
                required: true,
                autocomplete: "username webauthn",
            },
        },
        simpleWebAuthnBrowserVersion: DEFAULT_SIMPLEWEBAUTHN_BROWSER_VERSION,
        getUserInfo,
        getRelayingParty,
        ...config,
        type: "webauthn",
    };
}
/**
 * Retrieves user information for the WebAuthn provider.
 *
 * It looks for the "email" query parameter and uses it to look up the user in the database.
 * It also accepts a "name" query parameter to set the user's display name.
 *
 * @param options - The internaloptions object.
 * @param request - The request object containing the query parameters.
 * @returns The existing or new user info.
 * @throws {MissingAdapter} If the adapter is missing.
 * @throws {EmailSignInError} If the email address is not provided.
 */
const getUserInfo = async (options, request) => {
    const { adapter } = options;
    if (!adapter)
        throw new MissingAdapter("WebAuthn provider requires a database adapter to be configured");
    // Get email address from the query.
    const { query, body, method } = request;
    const email = (method === "POST" ? body?.email : query?.email);
    // If email is not provided, return null
    if (!email || typeof email !== "string")
        return null;
    const existingUser = await adapter.getUserByEmail(email);
    if (existingUser) {
        return { user: existingUser, exists: true };
    }
    // If the user does not exist, return a new user info.
    return { user: { email }, exists: false };
};
/**
 * Retrieves the relaying party information based on the provided options.
 * If the relaying party information is not provided, it falls back to using the URL information.
 */
function getRelayingParty(
/** The options object containing the provider and URL information. */
options) {
    const { provider, url } = options;
    const { relayingParty } = provider;
    const id = Array.isArray(relayingParty?.id)
        ? relayingParty.id[0]
        : relayingParty?.id;
    const name = Array.isArray(relayingParty?.name)
        ? relayingParty.name[0]
        : relayingParty?.name;
    const origin = Array.isArray(relayingParty?.origin)
        ? relayingParty.origin[0]
        : relayingParty?.origin;
    return {
        id: id ?? url.hostname,
        name: name ?? url.host,
        origin: origin ?? url.origin,
    };
}
